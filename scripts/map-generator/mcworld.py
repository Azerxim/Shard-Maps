#!/usr/bin/env python3
"""Lecture d'une sauvegarde Minecraft, sans dépendance ni serveur : NBT, régions, entités et joueurs.

Le serveur est en Fabric sans greffon : toutes les mesures viennent des fichiers de la sauvegarde.
- region/*.mca : InhabitedTime (temps passé par les joueurs dans le chunk) et lits posés ;
- entities/*.mca : villageois et nombre d'entités ;
- level.dat, playerdata/*.dat et stats/*.json : version du monde, positions, lits et temps de jeu.

Les fichiers ne sont lus qu'en lecture seule ; la sauvegarde n'est jamais modifiée.
"""
import glob
import gzip
import json
import os
import struct
import zlib

TICKS_PAR_HEURE = 20 * 3600

# Repères NBT : un identifiant de type sur un octet, puis le nom (longueur sur deux octets) et la valeur
TAG_FIN, TAG_OCTET, TAG_COURT, TAG_ENTIER, TAG_LONG, TAG_FLOTTANT, TAG_DOUBLE = 0, 1, 2, 3, 4, 5, 6
TAG_OCTETS, TAG_TEXTE, TAG_LISTE, TAG_COMPOSE, TAG_ENTIERS, TAG_LONGS = 7, 8, 9, 10, 11, 12

# "minecraft:villager" précédé de sa longueur : exclut minecraft:villager_spawn_egg et minecraft:zombie_villager
MARQUE_VILLAGEOIS = b"\x00\x12minecraft:villager"


# ---------------------------------------------------------------------------
# NBT

class Lecteur:
    """Lecture complète d'un NBT (level.dat, fichiers de joueurs) : renvoie des objets Python."""

    def __init__(self, data):
        self.data, self.pos = data, 0

    def prendre(self, taille):
        morceau = self.data[self.pos:self.pos + taille]
        self.pos += taille
        return morceau

    def nombre(self, format_):
        return struct.unpack(format_, self.prendre(struct.calcsize(format_)))[0]

    def texte(self):
        return self.prendre(self.nombre(">H")).decode("utf-8", "replace")

    def valeur(self, tag):
        if tag == TAG_OCTET: return self.nombre(">b")
        if tag == TAG_COURT: return self.nombre(">h")
        if tag == TAG_ENTIER: return self.nombre(">i")
        if tag == TAG_LONG: return self.nombre(">q")
        if tag == TAG_FLOTTANT: return self.nombre(">f")
        if tag == TAG_DOUBLE: return self.nombre(">d")
        if tag == TAG_TEXTE: return self.texte()
        if tag == TAG_OCTETS: return self.prendre(self.nombre(">i"))
        if tag == TAG_ENTIERS:
            nombre = self.nombre(">i")
            return list(struct.unpack(f">{nombre}i", self.prendre(4 * nombre)))
        if tag == TAG_LONGS:
            nombre = self.nombre(">i")
            return list(struct.unpack(f">{nombre}q", self.prendre(8 * nombre)))
        if tag == TAG_LISTE:
            element, nombre = self.nombre(">b"), self.nombre(">i")
            return [self.valeur(element) for _ in range(max(0, nombre))]
        if tag == TAG_COMPOSE:
            resultat = {}
            while True:
                element = self.nombre(">b")
                if element == TAG_FIN:
                    return resultat
                # Le nom précède la valeur : le lire d'abord (Python évaluerait la valeur en premier)
                nom = self.texte()
                resultat[nom] = self.valeur(element)
        raise ValueError(f"tag NBT inconnu : {tag}")


def lire_nbt(data):
    """Compound racine d'un NBT, compressé (gzip) ou non."""
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    lecteur = Lecteur(data)
    if lecteur.nombre(">b") != TAG_COMPOSE:
        raise ValueError("racine NBT inattendue")
    lecteur.texte()
    return lecteur.valeur(TAG_COMPOSE)


def lire_fichier_nbt(chemin):
    with open(chemin, "rb") as fichier:
        return lire_nbt(fichier.read())


# ---------------------------------------------------------------------------
# Régions (.mca) : lecture rapide, sans construire les objets inutiles

def _sauter(data, pos, tag):
    """Avance jusqu'à la fin d'une valeur sans la décoder (le gros d'un chunk ne sert pas ici)."""
    if tag == TAG_OCTET: return pos + 1
    if tag == TAG_COURT: return pos + 2
    if tag in (TAG_ENTIER, TAG_FLOTTANT): return pos + 4
    if tag in (TAG_LONG, TAG_DOUBLE): return pos + 8
    if tag == TAG_TEXTE: return pos + 2 + struct.unpack_from(">H", data, pos)[0]
    if tag == TAG_OCTETS: return pos + 4 + struct.unpack_from(">i", data, pos)[0]
    if tag == TAG_ENTIERS: return pos + 4 + 4 * struct.unpack_from(">i", data, pos)[0]
    if tag == TAG_LONGS: return pos + 4 + 8 * struct.unpack_from(">i", data, pos)[0]
    if tag == TAG_LISTE:
        element = data[pos]
        nombre = struct.unpack_from(">i", data, pos + 1)[0]
        pos += 5
        for _ in range(max(0, nombre)):
            pos = _sauter(data, pos, element)
        return pos
    if tag == TAG_COMPOSE:
        while True:
            element = data[pos]
            pos += 1
            if element == TAG_FIN:
                return pos
            pos += 2 + struct.unpack_from(">H", data, pos)[0]
            pos = _sauter(data, pos, element)
    raise ValueError(f"tag NBT inconnu : {tag}")


def _valeur_simple(data, pos, tag):
    if tag == TAG_ENTIER: return struct.unpack_from(">i", data, pos)[0], pos + 4
    if tag == TAG_LONG: return struct.unpack_from(">q", data, pos)[0], pos + 8
    if tag == TAG_TEXTE:
        taille = struct.unpack_from(">H", data, pos)[0]
        return data[pos + 2:pos + 2 + taille].decode("utf-8", "replace"), pos + 2 + taille
    raise ValueError(f"valeur NBT inattendue : {tag}")


def chunks_region(chemin):
    """Itère sur les chunks d'un fichier .mca : (index, contenu NBT décompressé)."""
    with open(chemin, "rb") as fichier:
        entete = fichier.read(4096)
        if len(entete) < 4096:
            return
        for index in range(1024):
            decalage = int.from_bytes(entete[index * 4:index * 4 + 3], "big")
            if decalage == 0:
                continue
            fichier.seek(decalage * 4096)
            taille = int.from_bytes(fichier.read(4), "big")
            if taille <= 0:
                continue
            compression = fichier.read(1)[0]
            contenu = fichier.read(taille - 1)
            try:
                if compression == 2:
                    contenu = zlib.decompress(contenu)
                elif compression == 1:
                    contenu = gzip.decompress(contenu)
                elif compression != 3:
                    continue  # LZ4 ou fichier externe : ignoré
            except zlib.error:
                continue
            yield index, contenu


def resume_chunk(data):
    """{position, temps de présence, moitiés de lit} d'un chunk, sans lire les blocs.

    Un lit occupe deux blocs, chacun avec son bloc-entité : les moitiés sont divisées par deux
    une fois additionnées sur une zone entière (division au chunk près, l'écart se compenserait mal).
    """
    pos, resume = 3, {"moities": 0, "ticks": 0, "x": 0, "z": 0}  # 3 = tag racine + nom vide
    while True:
        tag = data[pos]
        pos += 1
        if tag == TAG_FIN:
            return resume
        taille = struct.unpack_from(">H", data, pos)[0]
        nom = data[pos + 2:pos + 2 + taille].decode("utf-8", "replace")
        pos += 2 + taille
        if nom == "InhabitedTime":
            resume["ticks"], pos = _valeur_simple(data, pos, tag)
        elif nom == "xPos":
            resume["x"], pos = _valeur_simple(data, pos, tag)
        elif nom == "zPos":
            resume["z"], pos = _valeur_simple(data, pos, tag)
        elif nom == "block_entities":
            element = data[pos]
            nombre = struct.unpack_from(">i", data, pos + 1)[0]
            pos += 5
            for _ in range(max(0, nombre)):
                debut = pos
                pos = _sauter(data, pos, element)
                if b"minecraft:bed" in data[debut:pos]:
                    resume["moities"] += 1
        else:
            pos = _sauter(data, pos, tag)


def resume_entites(data):
    """{position, entités, villageois} d'un chunk du dossier entities."""
    pos, resume = 3, {"entites": 0, "villageois": 0, "x": 0, "z": 0}
    while True:
        tag = data[pos]
        pos += 1
        if tag == TAG_FIN:
            return resume
        taille = struct.unpack_from(">H", data, pos)[0]
        nom = data[pos + 2:pos + 2 + taille].decode("utf-8", "replace")
        pos += 2 + taille
        if nom == "Position":
            positions, pos = struct.unpack_from(">i", data, pos)[0], pos + 4
            valeurs = struct.unpack_from(f">{positions}i", data, pos)
            pos += 4 * positions
            if len(valeurs) >= 2:
                resume["x"], resume["z"] = valeurs[0], valeurs[1]
        elif nom == "Entities":
            debut = pos
            resume["entites"] = max(0, struct.unpack_from(">i", data, pos + 1)[0])
            pos = _sauter(data, pos, tag)
            resume["villageois"] = data[debut:pos].count(MARQUE_VILLAGEOIS)
        else:
            pos = _sauter(data, pos, tag)


def lire_dimension(dossier):
    """Parcourt region/ et entities/ d'une dimension.

    Renvoie (totaux, chunks) où chunks vaut { (chunk x, chunk z): {ticks, moities, villageois} },
    `moities` comptant les moitiés de lit (voir resume_chunk).
    """
    chunks = {}
    totaux = {"chunks": 0, "ticks": 0, "moities": 0, "villageois": 0, "entites": 0, "octets": 0, "regions": 0,
              "illisibles": 0}

    for chemin in sorted(glob.glob(os.path.join(dossier, "region", "*.mca"))):
        totaux["regions"] += 1
        totaux["octets"] += os.path.getsize(chemin)
        for _, contenu in chunks_region(chemin):
            try:
                resume = resume_chunk(contenu)
            except (ValueError, struct.error, IndexError):
                totaux["illisibles"] += 1
                continue
            totaux["chunks"] += 1
            totaux["ticks"] += resume["ticks"]
            totaux["moities"] += resume["moities"]
            if resume["ticks"] or resume["moities"]:
                case = chunks.setdefault((resume["x"], resume["z"]), {"ticks": 0, "moities": 0, "villageois": 0})
                case["ticks"] += resume["ticks"]
                case["moities"] += resume["moities"]

    for chemin in sorted(glob.glob(os.path.join(dossier, "entities", "*.mca"))):
        for _, contenu in chunks_region(chemin):
            try:
                resume = resume_entites(contenu)
            except (ValueError, struct.error, IndexError):
                totaux["illisibles"] += 1
                continue
            totaux["entites"] += resume["entites"]
            totaux["villageois"] += resume["villageois"]
            if resume["villageois"]:
                case = chunks.setdefault((resume["x"], resume["z"]), {"ticks": 0, "moities": 0, "villageois": 0})
                case["villageois"] += resume["villageois"]

    return totaux, chunks


# ---------------------------------------------------------------------------
# Monde et joueurs

def infos_monde(racine):
    """Nom, version et date de la sauvegarde, d'après level.dat."""
    infos = {"nom": os.path.basename(racine.rstrip(os.sep)), "version": None, "data_version": None, "temps": None}
    chemin = os.path.join(racine, "level.dat")
    if not os.path.exists(chemin):
        return infos
    try:
        donnees = lire_fichier_nbt(chemin).get("Data", {})
    except (ValueError, OSError, struct.error):
        return infos
    infos["nom"] = donnees.get("LevelName") or infos["nom"]
    infos["version"] = (donnees.get("Version") or {}).get("Name")
    infos["data_version"] = donnees.get("DataVersion")
    if donnees.get("LastPlayed"):
        infos["temps"] = donnees["LastPlayed"] / 1000  # horodatage Unix en millisecondes
    return infos


# Statistiques retenues pour chaque joueur : { champ: clé minecraft:custom }
STATS_JOUEUR = {
    "sessions": "minecraft:leave_game",
    "morts": "minecraft:deaths",
    "joueurs_tues": "minecraft:player_kills",
    "monstres_tues": "minecraft:mob_kills",
    "nuits_dormies": "minecraft:sleep_in_bed",
}
# Compteurs de déplacement, en centimètres
DEPLACEMENTS = ("minecraft:walk_one_cm", "minecraft:sprint_one_cm", "minecraft:crouch_one_cm",
                "minecraft:swim_one_cm", "minecraft:walk_on_water_one_cm", "minecraft:walk_under_water_one_cm",
                "minecraft:boat_one_cm", "minecraft:horse_one_cm", "minecraft:minecart_one_cm",
                "minecraft:fly_one_cm", "minecraft:aviate_one_cm", "minecraft:climb_one_cm")


def _statistiques_joueur(racine, uuid):
    chemin = os.path.join(racine, "stats", f"{uuid}.json")
    if not os.path.exists(chemin):
        return {}
    try:
        with open(chemin, encoding="utf-8") as fichier:
            stats = json.load(fichier).get("stats", {})
    except (ValueError, OSError):
        return {}
    compteurs = stats.get("minecraft:custom", {})
    mesures = {champ: int(compteurs.get(cle, 0)) for champ, cle in STATS_JOUEUR.items()}
    mesures["heures_jeu"] = round(int(compteurs.get("minecraft:play_time", 0)) / TICKS_PAR_HEURE, 2)
    mesures["distance_km"] = round(sum(int(compteurs.get(cle, 0)) for cle in DEPLACEMENTS) / 100000, 2)
    mesures["blocs_mines"] = sum(int(valeur) for valeur in stats.get("minecraft:mined", {}).values())
    return mesures


def _point_de_reapparition(donnees):
    """Lit du joueur : SpawnX/SpawnZ (≤ 1.20) ou respawn.pos (≥ 1.21)."""
    if donnees.get("SpawnX") is not None:
        return donnees["SpawnX"], donnees.get("SpawnZ"), donnees.get("SpawnDimension")
    respawn = donnees.get("respawn") or {}
    position = respawn.get("pos")
    if isinstance(position, (list, tuple)) and len(position) >= 3:
        return position[0], position[2], respawn.get("dimension")
    return None, None, None


def lire_joueurs(racine, noms=None):
    """Un dictionnaire par joueur : position, lit, temps de jeu et statistiques."""
    noms = noms or {}
    joueurs = []
    for chemin in sorted(glob.glob(os.path.join(racine, "playerdata", "*.dat"))):
        uuid = os.path.splitext(os.path.basename(chemin))[0]
        try:
            donnees = lire_fichier_nbt(chemin)
        except (ValueError, OSError, struct.error, IndexError):
            continue
        position = donnees.get("Pos") or []
        lit_x, lit_z, lit_dimension = _point_de_reapparition(donnees)
        joueur = {
            "uuid": uuid,
            "pseudo": noms.get(uuid.replace("-", "").lower()),
            "niveau": donnees.get("XpLevel"),
            # Date du fichier : dernière déconnexion sur le serveur (fausse sur une sauvegarde recopiée)
            "derniere_activite": os.path.getmtime(chemin),
            "dernier_x": int(position[0]) if len(position) >= 3 else None,
            "dernier_z": int(position[2]) if len(position) >= 3 else None,
            "derniere_dimension": donnees.get("Dimension"),
            "lit_x": int(lit_x) if lit_x is not None else None,
            "lit_z": int(lit_z) if lit_z is not None else None,
            "lit_dimension": lit_dimension,
        }
        joueur.update(_statistiques_joueur(racine, uuid))
        joueurs.append(joueur)
    return joueurs


def lire_noms_joueurs(*dossiers):
    """{ uuid sans tirets: pseudo } d'après usercache.json (racine du serveur)."""
    noms = {}
    for dossier in dossiers:
        if not dossier:
            continue
        chemin = os.path.join(dossier, "usercache.json")
        if not os.path.exists(chemin):
            continue
        try:
            with open(chemin, encoding="utf-8") as fichier:
                for entree in json.load(fichier):
                    if entree.get("uuid") and entree.get("name"):
                        noms[entree["uuid"].replace("-", "").lower()] = entree["name"]
        except (ValueError, OSError):
            continue
    return noms


def dossier_dimension(racine, source):
    """Dossier d'une dimension : "" (overworld), "DIM-1", "dimensions/namespace/nom"."""
    return os.path.join(racine, source) if source else racine
