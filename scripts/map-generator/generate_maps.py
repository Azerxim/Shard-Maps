#!/usr/bin/env python3
"""Génération hebdomadaire des cartes MinedMap à partir du monde hébergé sur Minestrator.

Adapté de MinedMap Viewer Generator (https://github.com/Azerxim/MinedMap-Viewer-Generator) :
- le monde est récupéré par SFTP (l'API Minestrator ne permet pas de télécharger les sauvegardes),
  en ne copiant que level.dat et les dossiers region, et uniquement les fichiers modifiés ;
- ou repris d'une sauvegarde déjà sur la machine avec --local-world (MAP_LOCAL_WORLD) ;
- les cartes sont générées de façon incrémentale dans work/output puis publiées dans assets/data ;
- maps.json est mis à jour sans écraser les entrées existantes ;
- une carte en erreur garde ses anciennes tuiles, les autres sont quand même publiées ;
- les statistiques du monde (présence, population, joueurs) sont relevées puis envoyées à Shard-API
  (world_stats.py, désactivable avec --no-stats).

Lancer via run.sh (environnement virtuel, verrou, logs).
"""
import argparse
import datetime as dt
import json
import os
import posixpath
import shutil
import stat
import subprocess
import sys
import time
import urllib.request

# Le relevé du monde vit à côté de ce fichier : importable même si le script est chargé par son chemin
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import world_stats

try:
    import paramiko
except ImportError:  # seul le SFTP en a besoin : --local-world fonctionne sans
    paramiko = None

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MAPS_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
CACHE_DIR = os.path.join(SCRIPT_DIR, ".cache")
WORK_DIR = os.path.join(SCRIPT_DIR, "work")
WORLD_DIR = os.path.join(WORK_DIR, "world")
OUTPUT_DIR = os.path.join(WORK_DIR, "output")
DATA_DIR = os.path.join(MAPS_DIR, "assets", "data")
CONFIG_PATH = os.path.join(SCRIPT_DIR, "maps.config.json")

# Dossiers lus par world_stats.py, en plus de region : entités par dimension, joueurs à la racine du monde
STATS_DIMENSION_DIRS = ("entities",)
STATS_WORLD_DIRS = ("playerdata", "stats")

MINESTRATOR_API = "https://mine.sttr.io"
MMVG_DIR = os.path.join(CACHE_DIR, "MinedMap-Viewer-Generator", "MinedMap")
GENERATORS = {
    "minedmap": os.environ.get("MINEDMAP_BIN") or os.path.join(MMVG_DIR, "MinedMap-2.2.0"),
    # Ancien MinedMap 1.19 : seul à rendre la surface du Nether (sous le toit de bedrock)
    "legacy_nether": os.environ.get("MINEDMAP_NETHER_BIN") or os.path.join(MMVG_DIR, "1.19", "Nether"),
}


def log(level, message):
    print(f"{dt.datetime.now():%Y-%m-%d %H:%M:%S} [{level}] {message}", flush=True)


def env_flag(name, default=False):
    value = os.environ.get(name)
    return default if value is None else value.strip().lower() in ("1", "true", "yes", "on")


# ---------------------------------------------------------------------------
# API Minestrator

def api_request(method, path, body=None):
    api_key = os.environ.get("MINESTRATOR_API_KEY")
    if not api_key:
        raise RuntimeError("MINESTRATOR_API_KEY n'est pas défini")
    request = urllib.request.Request(
        f"{MINESTRATOR_API}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read() or b"{}")


def find_key(data, key):
    """Cherche récursivement une clé dans la réponse de l'API (la structure exacte peut varier)."""
    if isinstance(data, dict):
        if key in data:
            return data[key]
        values = data.values()
    elif isinstance(data, list):
        values = data
    else:
        return None
    for value in values:
        found = find_key(value, key)
        if found is not None:
            return found
    return None


def send_command(server_id, command):
    api_request("PUT", f"/server/{server_id}/command", {"command": command})
    log("API", f"Commande envoyée : {command}")


def sftp_credentials(server_id):
    creds = {
        "host": os.environ.get("MINESTRATOR_SFTP_HOST"),
        "port": os.environ.get("MINESTRATOR_SFTP_PORT"),
        "user": os.environ.get("MINESTRATOR_SFTP_USER"),
        "password": os.environ.get("MINESTRATOR_SFTP_PASSWORD"),
    }
    if not (creds["host"] and creds["port"] and creds["user"]):
        if not server_id:
            raise RuntimeError("Définir MINESTRATOR_SERVER_ID ou MINESTRATOR_SFTP_HOST/PORT/USER")
        sftp = find_key(api_request("GET", f"/server/{server_id}"), "sftp") or {}
        for key in ("host", "port", "user"):
            creds[key] = creds[key] or sftp.get(key)
        # L'API renvoie un mot de passe vide : il doit venir de l'environnement
        creds["password"] = creds["password"] or sftp.get("password")
    if not creds["password"]:
        raise RuntimeError("MINESTRATOR_SFTP_PASSWORD n'est pas défini")
    if not (creds["host"] and creds["port"] and creds["user"]):
        raise RuntimeError("Impossible de déterminer les identifiants SFTP")
    creds["port"] = int(creds["port"])
    return creds


# ---------------------------------------------------------------------------
# SFTP

def connect_sftp(creds):
    if paramiko is None:
        raise RuntimeError("paramiko n'est pas installé : lancer via run.sh, ou utiliser --local-world")
    os.makedirs(CACHE_DIR, exist_ok=True)
    known_hosts = os.path.join(CACHE_DIR, "known_hosts")
    client = paramiko.SSHClient()
    if os.path.exists(known_hosts):
        client.load_host_keys(known_hosts)
    # Première connexion : la clé du nœud est enregistrée, puis vérifiée aux exécutions suivantes
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(creds["host"], port=creds["port"], username=creds["user"], password=creds["password"],
                   timeout=30, allow_agent=False, look_for_keys=False)
    client.save_host_keys(known_hosts)
    return client, client.open_sftp()


def remote_exists(sftp, path):
    try:
        sftp.stat(path)
        return True
    except IOError:
        return False


def sync_file(sftp, remote, local, attr, stats):
    if os.path.exists(local):
        local_stat = os.stat(local)
        if local_stat.st_size == attr.st_size and int(local_stat.st_mtime) == int(attr.st_mtime):
            stats["skipped"] += 1
            return
    tmp = f"{local}.part"
    sftp.get(remote, tmp)
    # Conserver la date distante : MinedMap s'en sert pour ne regénérer que les régions modifiées
    os.utime(tmp, (int(attr.st_mtime), int(attr.st_mtime)))
    os.replace(tmp, local)
    stats["downloaded"] += 1
    stats["bytes"] += attr.st_size


def mirror_dir(sftp, remote, local, stats):
    """Copie un dossier distant, en supprimant localement ce qui n'existe plus sur le serveur."""
    os.makedirs(local, exist_ok=True)
    seen = set()
    for attr in sftp.listdir_attr(remote):
        seen.add(attr.filename)
        remote_path = posixpath.join(remote, attr.filename)
        local_path = os.path.join(local, attr.filename)
        if stat.S_ISDIR(attr.st_mode):
            mirror_dir(sftp, remote_path, local_path, stats)
        else:
            sync_file(sftp, remote_path, local_path, attr, stats)
    for name in os.listdir(local):
        if name not in seen:
            path = os.path.join(local, name)
            shutil.rmtree(path) if os.path.isdir(path) else os.remove(path)
            stats["deleted"] += 1


def world_name(sftp, root):
    if os.environ.get("MAP_WORLD_NAME"):
        return os.environ["MAP_WORLD_NAME"]
    try:
        with sftp.open(posixpath.join(root, "server.properties")) as properties:
            for line in properties.read().decode("utf-8", "ignore").splitlines():
                if line.startswith("level-name="):
                    return line.split("=", 1)[1].strip() or "world"
    except IOError:
        pass
    return "world"


def discover_custom_dimensions(sftp, remote_world):
    """dimensions/<namespace>/<nom>/region -> ["namespace/nom", ...]"""
    base = posixpath.join(remote_world, "dimensions")
    found = []
    if not remote_exists(sftp, base):
        return found
    for namespace in sftp.listdir_attr(base):
        if not stat.S_ISDIR(namespace.st_mode):
            continue
        for dimension in sftp.listdir_attr(posixpath.join(base, namespace.filename)):
            relative = f"dimensions/{namespace.filename}/{dimension.filename}"
            if stat.S_ISDIR(dimension.st_mode) and remote_exists(sftp, posixpath.join(remote_world, relative, "region")):
                found.append(relative)
    return found


def download_world(sources, avec_stats=False):
    server_id = os.environ.get("MINESTRATOR_SERVER_ID")
    creds = sftp_credentials(server_id)
    use_save_commands = server_id and env_flag("MAP_SAVE_COMMANDS", True)

    client, sftp = connect_sftp(creds)
    log("SFTP", f"Connecté à {creds['host']}:{creds['port']}")
    stats = {"downloaded": 0, "skipped": 0, "deleted": 0, "bytes": 0}
    try:
        root = os.environ.get("MINESTRATOR_SFTP_ROOT", ".")
        remote_world = posixpath.join(root, world_name(sftp, root))
        if not remote_exists(sftp, posixpath.join(remote_world, "level.dat")):
            raise RuntimeError(f"level.dat introuvable dans {remote_world}")
        log("SFTP", f"Monde : {remote_world}")

        if use_save_commands:
            # Suspendre l'écriture des régions pendant la copie pour avoir des fichiers cohérents
            send_command(server_id, "save-off")
            send_command(server_id, "save-all flush")
            time.sleep(int(os.environ.get("MAP_SAVE_WAIT", "20")))
        try:
            os.makedirs(WORLD_DIR, exist_ok=True)
            sync_file(sftp, posixpath.join(remote_world, "level.dat"), os.path.join(WORLD_DIR, "level.dat"),
                      sftp.stat(posixpath.join(remote_world, "level.dat")), stats)
            dossiers = ("region",) + (STATS_DIMENSION_DIRS if avec_stats else ())
            for source in sources:
                for dossier in dossiers:
                    remote_dir = posixpath.join(remote_world, source, dossier) if source else posixpath.join(remote_world, dossier)
                    local_dir = os.path.join(WORLD_DIR, source, dossier)
                    if remote_exists(sftp, remote_dir):
                        log("SFTP", f"Synchronisation de {source or '.'}/{dossier}")
                        mirror_dir(sftp, remote_dir, local_dir, stats)
                    elif dossier == "region":
                        log("WARN", f"{source or '.'}/region absent sur le serveur")
            if avec_stats:
                # Joueurs (positions, lits, temps de jeu) et pseudos, pour les statistiques
                for dossier in STATS_WORLD_DIRS:
                    remote_dir = posixpath.join(remote_world, dossier)
                    if remote_exists(sftp, remote_dir):
                        log("SFTP", f"Synchronisation de {dossier}")
                        mirror_dir(sftp, remote_dir, os.path.join(WORLD_DIR, dossier), stats)
                usercache = posixpath.join(root, "usercache.json")
                if remote_exists(sftp, usercache):
                    sync_file(sftp, usercache, os.path.join(WORK_DIR, "usercache.json"), sftp.stat(usercache), stats)
        finally:
            if use_save_commands:
                send_command(server_id, "save-on")
    finally:
        sftp.close()
        client.close()

    log("SFTP", f"{stats['downloaded']} fichier(s) téléchargé(s) ({stats['bytes'] / 1048576:.1f} Mo), "
                f"{stats['skipped']} inchangé(s), {stats['deleted']} supprimé(s)")


# ---------------------------------------------------------------------------
# Sauvegarde locale (--local-world)

def local_world_root(path):
    """Dossier du monde (contenant level.dat), accepté aussi sous forme de dossier de serveur (world/…)."""
    root = os.path.abspath(os.path.expanduser(path))
    if not os.path.isdir(root):
        raise RuntimeError(f"Sauvegarde locale introuvable : {root}")
    if os.path.exists(os.path.join(root, "level.dat")):
        return root

    candidates = [os.environ.get("MAP_WORLD_NAME")]
    properties = os.path.join(root, "server.properties")
    if os.path.exists(properties):
        with open(properties, encoding="utf-8", errors="ignore") as f:
            for line in f:
                if line.startswith("level-name="):
                    candidates.append(line.split("=", 1)[1].strip())
    candidates.append("world")
    for candidate in candidates:
        if candidate and os.path.exists(os.path.join(root, candidate, "level.dat")):
            return os.path.join(root, candidate)
    raise RuntimeError(f"level.dat introuvable dans {root}, ni dans un sous-dossier de monde")


def link_or_copy(source, target, stats):
    """Lien matériel quand c'est possible (aucune copie sur le disque), sinon copie en gardant la date."""
    info = os.stat(source)
    if os.path.exists(target):
        existing = os.stat(target)
        if existing.st_size == info.st_size and int(existing.st_mtime) == int(info.st_mtime):
            stats["skipped"] += 1
            return
        os.remove(target)
    try:
        os.link(source, target)
    except OSError:
        # Systèmes de fichiers différents (disque externe, montage réseau…)
        shutil.copy2(source, target)
    stats["copied"] += 1
    stats["bytes"] += info.st_size


def mirror_local_dir(source, target, stats):
    """Copie un dossier local, en supprimant dans la copie ce qui n'existe plus dans la sauvegarde."""
    os.makedirs(target, exist_ok=True)
    seen = set()
    for name in os.listdir(source):
        seen.add(name)
        source_path, target_path = os.path.join(source, name), os.path.join(target, name)
        if os.path.isdir(source_path):
            mirror_local_dir(source_path, target_path, stats)
        else:
            link_or_copy(source_path, target_path, stats)
    for name in os.listdir(target):
        if name not in seen:
            path = os.path.join(target, name)
            shutil.rmtree(path) if os.path.isdir(path) else os.remove(path)
            stats["deleted"] += 1


def copy_local_world(root, sources):
    """Prépare work/world depuis une sauvegarde locale : même résultat que le SFTP, sans réseau.

    La sauvegarde n'est jamais modifiée (MinedMap lit work/world, où level.dat est recopié au besoin).
    Sur un serveur en cours d'exécution, préférer une sauvegarde arrêtée : les régions peuvent être incomplètes.
    """
    stats = {"copied": 0, "skipped": 0, "deleted": 0, "bytes": 0}
    os.makedirs(WORLD_DIR, exist_ok=True)
    log("LOCAL", f"Monde : {root}")
    link_or_copy(os.path.join(root, "level.dat"), os.path.join(WORLD_DIR, "level.dat"), stats)
    for source in sources:
        region = os.path.join(root, source, "region")
        if os.path.isdir(region):
            log("LOCAL", f"Reprise de {source or '.'}/region")
            mirror_local_dir(region, os.path.join(WORLD_DIR, source, "region"), stats)
        else:
            log("WARN", f"{source or '.'}/region absent de la sauvegarde")
    log("LOCAL", f"{stats['copied']} fichier(s) repris ({stats['bytes'] / 1048576:.1f} Mo), "
                 f"{stats['skipped']} inchangé(s), {stats['deleted']} supprimé(s)")


def discover_local_dimensions(root):
    """dimensions/<namespace>/<nom>/region -> ["namespace/nom", ...], dans un monde présent sur la machine"""
    base = os.path.join(root, "dimensions")
    if not os.path.isdir(base):
        return []
    return [f"dimensions/{namespace}/{name}"
            for namespace in sorted(os.listdir(base)) if os.path.isdir(os.path.join(base, namespace))
            for name in sorted(os.listdir(os.path.join(base, namespace)))
            if os.path.isdir(os.path.join(base, namespace, name, "region"))]


# ---------------------------------------------------------------------------
# Génération

def slug(value):
    return "".join(c if c.isalpha() and c.isascii() else "_" for c in value.lower()).strip("_")


def build_map_list(config, custom_dimensions):
    maps = [m for m in config["maps"] if m.get("enabled", True)]
    for relative in custom_dimensions:
        namespace, name = relative.split("/")[1:]
        # nginx n'accepte que [a-z_] dans les noms de cartes
        maps.append({"name": slug(f"{namespace}_{name}"), "label": f"{namespace}:{name}",
                     "group": "dimensions", "source": relative, "generator": "minedmap"})
    return maps


def generate_map(entry):
    name = entry["name"]
    source = os.path.join(WORLD_DIR, entry.get("source", ""))
    output = os.path.join(OUTPUT_DIR, name)
    binary = GENERATORS[entry.get("generator", "minedmap")]

    if not os.path.isdir(os.path.join(source, "region")):
        raise RuntimeError(f"pas de dossier region dans {source}")
    if not os.access(binary, os.X_OK):
        raise RuntimeError(f"binaire introuvable ou non exécutable : {binary}")

    # MinedMap lit level.dat dans le dossier source (comme le générateur d'origine)
    if os.path.abspath(source) != WORLD_DIR:
        shutil.copy2(os.path.join(WORLD_DIR, "level.dat"), os.path.join(source, "level.dat"))

    # Première exécution : repartir des données publiées pour profiter de l'incrémental
    published = os.path.join(DATA_DIR, name)
    if not os.path.isdir(output) and os.path.isdir(published):
        log("GEN", f"{name} : initialisation depuis assets/data/{name}")
        shutil.copytree(published, output)
    os.makedirs(output, exist_ok=True)

    command = [binary, source, output]
    if entry.get("generator", "minedmap") == "minedmap":
        command[1:1] = ["--jobs", os.environ.get("MAP_JOBS", "0")]
        for prefix in filter(None, os.environ.get("MAP_SIGN_PREFIX", "").split(",")):
            command[1:1] = ["--sign-prefix", prefix]

    log("GEN", f"{name} : {' '.join(command)}")
    started = time.monotonic()
    subprocess.run(command, check=True)
    if not os.path.exists(os.path.join(output, "info.json")):
        raise RuntimeError("info.json absent après génération")
    log("GEN", f"{name} : terminé en {time.monotonic() - started:.0f} s")


def publish_map(name):
    target = os.path.join(DATA_DIR, name)
    os.makedirs(target, exist_ok=True)
    # --delay-updates : les nouveaux fichiers remplacent les anciens en fin de copie,
    # la carte servie n'est pas incohérente pendant la publication
    subprocess.run(["rsync", "-a", "--delete", "--delay-updates", "--exclude", "processed/",
                    f"{os.path.join(OUTPUT_DIR, name)}/", f"{target}/"], check=True)
    log("PUB", f"{name} publiée dans assets/data/{name}")


def update_maps_json(generated):
    path = os.path.join(DATA_DIR, "maps.json")
    maps_json = {"vanilla": {}, "dimensions": {}, "date": ""}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            maps_json.update(json.load(f))
    for entry in generated:
        maps_json.setdefault(entry.get("group", "vanilla"), {})[entry["label"]] = entry["name"]
    maps_json["date"] = dt.date.today().strftime("%d/%m/%Y")
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(maps_json, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    log("PUB", "maps.json mis à jour")


# ---------------------------------------------------------------------------
# Statistiques du monde

def collect_stats(world_root, maps, server_root=None, envoi=True):
    """Relevé des statistiques du monde, envoyé à Shard-API (world_stats.py)."""
    api_url = os.environ.get("SHARD_API_BASE_URL", "").strip()
    cle = os.environ.get("MAP_STATS_API_KEY", "").strip()
    sources = sorted({m.get("source", "") for m in maps})
    log("STATS", f"Relevé du monde : {', '.join(source or 'overworld' for source in sources)}")
    world_stats.relever(world_root, sources, maps, api_url, cle, racine_serveur=server_root, envoi=envoi)


# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--skip-download", action="store_true", help="regénérer à partir de la copie déjà présente dans work/world")
    parser.add_argument("--local-world", metavar="CHEMIN", default=os.environ.get("MAP_LOCAL_WORLD") or None,
                        help="utiliser une sauvegarde présente sur la machine (dossier du monde ou du serveur) au lieu du SFTP")
    parser.add_argument("--no-publish", action="store_true", help="générer sans copier dans assets/data")
    parser.add_argument("--no-stats", action="store_true", help="ne pas relever les statistiques du monde")
    parser.add_argument("--stats-only", action="store_true", help="relever les statistiques sans générer de carte")
    parser.add_argument("--stats-no-send", action="store_true", help="relever les statistiques sans les envoyer à l'API")
    parser.add_argument("--only", action="append", metavar="NOM", help="ne traiter que cette carte (répétable)")
    args = parser.parse_args()

    with open(CONFIG_PATH, encoding="utf-8") as f:
        config = json.load(f)

    local_root = local_world_root(args.local_world) if args.local_world else None

    custom_dimensions = []
    if config.get("custom_dimensions"):
        if args.skip_download:
            custom_dimensions = discover_local_dimensions(WORLD_DIR)
        elif local_root:
            custom_dimensions = discover_local_dimensions(local_root)
        else:
            creds = sftp_credentials(os.environ.get("MINESTRATOR_SERVER_ID"))
            client, sftp = connect_sftp(creds)
            try:
                root = os.environ.get("MINESTRATOR_SFTP_ROOT", ".")
                custom_dimensions = discover_custom_dimensions(sftp, posixpath.join(root, world_name(sftp, root)))
            finally:
                sftp.close()
                client.close()

    maps = build_map_list(config, custom_dimensions)
    if args.only:
        maps = [m for m in maps if m["name"] in args.only]
    if not maps:
        log("ERROR", "Aucune carte à générer")
        return 1

    avec_stats = env_flag("MAP_STATS", True) and not args.no_stats
    sources = sorted({m.get("source", "") for m in maps})
    if args.skip_download:
        log("WORLD", "Copie déjà présente dans work/world réutilisée")
    elif local_root and args.stats_only:
        # Le relevé lit la sauvegarde directement : rien à recopier
        log("LOCAL", f"Monde : {local_root}")
    elif local_root:
        copy_local_world(local_root, sources)
    else:
        download_world(sources, avec_stats=avec_stats)

    # La sauvegarde locale est lue telle quelle : seules les régions sont recopiées pour MinedMap
    stats_root = local_root or WORLD_DIR
    stats_server_root = os.path.dirname(local_root.rstrip(os.sep)) if local_root else WORK_DIR

    if args.stats_only:
        if not avec_stats:
            log("ERROR", "--stats-only et --no-stats sont incompatibles")
            return 1
        collect_stats(stats_root, maps, stats_server_root, envoi=not args.stats_no_send)
        return 0

    generated, failed = [], []
    for entry in maps:
        try:
            generate_map(entry)
            if not args.no_publish:
                publish_map(entry["name"])
            generated.append(entry)
        except Exception as error:  # une carte en erreur ne bloque pas les autres
            log("ERROR", f"{entry['name']} : {error}")
            failed.append(entry["name"])

    if generated and not args.no_publish:
        update_maps_json(generated)

    if avec_stats:
        try:
            collect_stats(stats_root, maps, stats_server_root, envoi=not args.stats_no_send)
        except Exception as error:  # les cartes sont déjà publiées : le relevé ne doit pas faire échouer la génération
            log("ERROR", f"Statistiques du monde : {error}")

    log("DONE", f"{len(generated)} carte(s) générée(s)" + (f", en erreur : {', '.join(failed)}" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        log("ERROR", str(error))
        sys.exit(1)
