#!/usr/bin/env python3
"""Statistiques du monde : lit la sauvegarde, rapporte les mesures aux lieux du site et les envoie à Shard-API.

Le serveur est en Fabric sans greffon : tout se déduit des fichiers de la sauvegarde (voir mcworld.py).

Mesures conservées :
- présence : InhabitedTime, le temps passé par les joueurs dans chaque chunk, en heures ;
- population : lits posés dans les chunks fréquentés (au moins MAP_STATS_BED_HOURS heures de présence),
  à l'intérieur des frontières de la ville ou du quartier — les villages générés par le jeu, jamais visités,
  sont ainsi écartés ;
- villageois, entités, joueurs (temps de jeu, dernière position, lit, statistiques).

Un lieu sans frontières tracées est mesuré dans un rayon autour de son point (mesure approximative).

Usage : ./run.sh --stats-only          (dans la foulée d'une génération : ./run.sh)
        python3 world_stats.py --world "/chemin/du/monde" --json releve.json --no-send
"""
import argparse
import datetime as dt
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request

import mcworld

TICKS_PAR_HEURE = mcworld.TICKS_PAR_HEURE
BLOCS_PAR_CHUNK = 16
# Un lit occupe deux blocs : les moitiés relevées dans les chunks sont divisées par deux
MOITIES_PAR_LIT = 2


def log(niveau, message):
    print(f"{dt.datetime.now():%Y-%m-%d %H:%M:%S} [{niveau}] {message}", flush=True)


def reglages():
    """Seuils de calcul, réglables dans .env."""
    def nombre(nom, defaut, conversion=int):
        valeur = os.environ.get(nom, "").strip()
        try:
            return conversion(valeur) if valeur else defaut
        except ValueError:
            return defaut

    return {
        "seuil_heures_lit": nombre("MAP_STATS_BED_HOURS", 10.0, float),
        "seuil_jours_actif": nombre("MAP_STATS_ACTIVE_DAYS", 30),
        "seuil_heures_actif": nombre("MAP_STATS_ACTIVE_HOURS", 1.0, float),
        "taille_tuile": max(16, nombre("MAP_STATS_TILE", 256)),
        "zones_gardees": nombre("MAP_STATS_TOP_ZONES", 25),
        "rayon_ville": nombre("MAP_STATS_RADIUS", 128),
        "rayon_quartier": nombre("MAP_STATS_QUARTIER_RADIUS", 64),
    }


# ---------------------------------------------------------------------------
# Données du site (villes, quartiers, frontières)

def _lire_api(base_url, chemin):
    url = f"{base_url.rstrip('/')}{chemin}"
    with urllib.request.urlopen(url, timeout=30) as reponse:
        return json.loads(reponse.read().decode("utf-8"))


def charger_site(base_url):
    """Villes, quartiers, civilisations, dimensions et frontières tracées sur la carte."""
    # /civilisations/list renvoie { civilisation, members, gouvernement, villes } : seule la fiche sert ici
    civilisations = [entree.get("civilisation", entree) for entree in _lire_api(base_url, "/civilisations/list?limit=1000")]
    return {
        "civilisations": civilisations,
        "villes": _lire_api(base_url, "/civilisations/villes/list?limit=1000"),
        "quartiers": _lire_api(base_url, "/civilisations/quartiers/list?limit=1000"),
        "dimensions": _lire_api(base_url, "/cartographie/dimensions/read?limit=100"),
        "cartographies": _lire_api(base_url, "/cartographie/list?limit=1000"),
    }


def sources_des_dimensions(cartes, dimensions):
    """{ id de dimension: dossier du monde }, en passant par le lien de la dimension et maps.config.json."""
    par_nom = {carte["name"]: carte.get("source", "") for carte in cartes}
    sources = {}
    for dimension in dimensions:
        lien = (dimension.get("link") or "").strip()
        if lien in par_nom:
            sources[dimension["id"]] = par_nom[lien]
    return sources


def _coordonnees(carto):
    """Frontières stockées par la carte en [-z, x] (Leaflet) -> [(x, z), ...] et cercles (x, z, rayon)."""
    try:
        valeurs = json.loads(carto.get("coordinates") or "[]")
    except ValueError:
        return None, None
    forme = carto.get("shape_type")
    if forme == "Circle" and len(valeurs) == 2 and isinstance(valeurs[0], (list, tuple)):
        centre, rayon = valeurs
        return None, (centre[1], -centre[0], float(rayon))
    if forme in ("Polygon", "Rectangle"):
        points = valeurs[0] if valeurs and isinstance(valeurs[0], list) and valeurs[0] and isinstance(valeurs[0][0], list) else valeurs
        sommets = [(point[1], -point[0]) for point in points if isinstance(point, (list, tuple)) and len(point) >= 2]
        return (sommets if len(sommets) >= 3 else None), None
    return None, None


def lieux_du_site(site, sources, reglage):
    """Liste des lieux à mesurer : frontières tracées quand elles existent, sinon rayon autour du point."""
    frontieres = {}
    for carto in site["cartographies"]:
        if carto.get("type") not in ("civilisation", "ville", "quartier") or not carto.get("type_id"):
            continue
        polygone, cercle = _coordonnees(carto)
        if not polygone and not cercle:
            continue
        entree = frontieres.setdefault((carto["type"], carto["type_id"]), {"polygones": [], "cercles": [], "dimension_id": None})
        entree["polygones" if polygone else "cercles"].append(polygone or cercle)
        entree["dimension_id"] = entree["dimension_id"] or carto.get("dimension_id")

    villes = {ville["id"]: ville for ville in site["villes"]}
    lieux = []

    def ajouter(entity_type, entite, dimension_id, rayon_defaut, civilisation_id=None):
        tracees = frontieres.get((entity_type, entite["id"]), {})
        dimension_id = dimension_id or tracees.get("dimension_id")
        lieu = {
            "entity_type": entity_type,
            "entity_id": entite["id"],
            "title": entite.get("title"),
            "civilisation_id": civilisation_id,
            "dimension_id": dimension_id,
            # None quand la dimension n'a pas de carte : le lieu n'est alors rattaché à aucun dossier du monde
            "source": sources.get(dimension_id),
            "x": entite.get("x"),
            "z": entite.get("z"),
            "polygones": tracees.get("polygones") or [],
            "cercles": list(tracees.get("cercles") or []),
            "methode": "frontieres",
            "rayon": None,
        }
        if not lieu["polygones"] and not lieu["cercles"]:
            if lieu["x"] is None or lieu["z"] is None:
                # Une civilisation n'a pas de point : ses mesures sont la somme de celles de ses villes
                if entity_type != "civilisation":
                    return
                lieu["methode"] = "villes"
            else:
                lieu["methode"] = "rayon"
                lieu["rayon"] = rayon_defaut
                lieu["cercles"] = [(lieu["x"], lieu["z"], float(rayon_defaut))]
        lieux.append(lieu)

    for civilisation in site["civilisations"]:
        ajouter("civilisation", civilisation, None, reglage["rayon_ville"])
    for ville in site["villes"]:
        ajouter("ville", ville, ville.get("dimension_id"), reglage["rayon_ville"], ville.get("civilisation_id"))
    for quartier in site["quartiers"]:
        ville = villes.get(quartier.get("ville_id")) or {}
        ajouter("quartier", quartier, ville.get("dimension_id"), reglage["rayon_quartier"], ville.get("civilisation_id"))
    return lieux


# ---------------------------------------------------------------------------
# Géométrie

def dans_polygone(x, z, sommets):
    """Lancer de rayon : vrai quand le point est à l'intérieur du contour."""
    dedans = False
    precedent_x, precedent_z = sommets[-1]
    for sommet_x, sommet_z in sommets:
        if (sommet_z > z) != (precedent_z > z):
            limite = (precedent_x - sommet_x) * (z - sommet_z) / (precedent_z - sommet_z) + sommet_x
            if x < limite:
                dedans = not dedans
        precedent_x, precedent_z = sommet_x, sommet_z
    return dedans


def dans_lieu(lieu, x, z):
    if any(dans_polygone(x, z, polygone) for polygone in lieu["polygones"]):
        return True
    return any((x - centre_x) ** 2 + (z - centre_z) ** 2 <= rayon ** 2 for centre_x, centre_z, rayon in lieu["cercles"])


def cadre(lieu):
    """Rectangle englobant du lieu, en blocs."""
    points = [point for polygone in lieu["polygones"] for point in polygone]
    points += [(centre_x - rayon, centre_z - rayon) for centre_x, centre_z, rayon in lieu["cercles"]]
    points += [(centre_x + rayon, centre_z + rayon) for centre_x, centre_z, rayon in lieu["cercles"]]
    if not points:
        return None
    xs = [point[0] for point in points]
    zs = [point[1] for point in points]
    return min(xs), min(zs), max(xs), max(zs)


# ---------------------------------------------------------------------------
# Mesures

def _lits(mesures):
    """Convertit les moitiés de lit accumulées en nombre de lits."""
    mesures["lits"] = mesures.pop("moities") // MOITIES_PAR_LIT
    mesures["lits_actifs"] = mesures.pop("moities_actives") // MOITIES_PAR_LIT
    return mesures


def mesurer_lieu(lieu, chunks, seuil_ticks):
    """Population et activité d'un lieu, d'après les chunks qu'il contient."""
    mesures = {"chunks": 0, "chunks_actifs": 0, "ticks": 0, "moities": 0, "moities_actives": 0, "villageois": 0}
    limites = cadre(lieu)
    if not limites:
        return _lits(mesures)  # lieu sans frontières ni point : mesures vides
    min_x, min_z, max_x, max_z = limites
    for chunk_x in range(math.floor(min_x / BLOCS_PAR_CHUNK), math.floor(max_x / BLOCS_PAR_CHUNK) + 1):
        for chunk_z in range(math.floor(min_z / BLOCS_PAR_CHUNK), math.floor(max_z / BLOCS_PAR_CHUNK) + 1):
            case = chunks.get((chunk_x, chunk_z))
            if not case:
                continue
            # Le chunk compte quand son centre est dans le lieu
            if not dans_lieu(lieu, chunk_x * BLOCS_PAR_CHUNK + 8, chunk_z * BLOCS_PAR_CHUNK + 8):
                continue
            mesures["chunks"] += 1
            mesures["ticks"] += case["ticks"]
            mesures["moities"] += case["moities"]
            mesures["villageois"] += case["villageois"]
            if case["ticks"]:
                mesures["chunks_actifs"] += 1
            if case["ticks"] >= seuil_ticks:
                mesures["moities_actives"] += case["moities"]
    return _lits(mesures)


def tuiles(chunks, taille, seuil_ticks=0):
    """Regroupe les chunks en tuiles carrées de `taille` blocs : { (x, z) du coin: mesures }."""
    chunks_par_tuile = max(1, taille // BLOCS_PAR_CHUNK)
    resultat = {}
    for (chunk_x, chunk_z), case in chunks.items():
        cle = (math.floor(chunk_x / chunks_par_tuile) * taille, math.floor(chunk_z / chunks_par_tuile) * taille)
        tuile = resultat.setdefault(cle, {"ticks": 0, "moities": 0, "moities_actives": 0, "villageois": 0, "chunks": 0})
        tuile["ticks"] += case["ticks"]
        tuile["moities"] += case["moities"]
        tuile["villageois"] += case["villageois"]
        tuile["chunks"] += 1
        if case["ticks"] >= seuil_ticks:
            tuile["moities_actives"] += case["moities"]
    for tuile in resultat.values():
        _lits(tuile)
    return resultat


def lieu_le_plus_proche(lieux, source, x, z):
    """Lieu contenant le point, sinon le plus proche de la même dimension (distance en blocs)."""
    candidats = [lieu for lieu in lieux if lieu.get("source") == source]
    for lieu in candidats:
        if dans_lieu(lieu, x, z):
            return lieu, 0
    proche, distance = None, None
    for lieu in candidats:
        if lieu.get("x") is None or lieu.get("z") is None:
            continue
        ecart = int(math.hypot(lieu["x"] - x, lieu["z"] - z))
        if distance is None or ecart < distance:
            proche, distance = lieu, ecart
    return proche, distance


# Dimensions du jeu -> dossier de la sauvegarde
DOSSIERS_DIMENSIONS = {
    "minecraft:overworld": "",
    "minecraft:the_nether": "DIM-1",
    "minecraft:the_end": "DIM1",
}


def dossier_de_dimension(nom):
    """minecraft:the_nether -> DIM-1 ; une dimension de mod -> dimensions/namespace/nom."""
    if not nom:
        return ""
    if nom in DOSSIERS_DIMENSIONS:
        return DOSSIERS_DIMENSIONS[nom]
    return f"dimensions/{nom.replace(':', '/')}" if ":" in nom else ""


def _position_joueur(joueur, cle_x, cle_z, cle_dimension):
    """(dossier de la dimension, x, z) de la position demandée, ou None."""
    x, z = joueur.get(cle_x), joueur.get(cle_z)
    if x is None or z is None:
        return None
    return dossier_de_dimension(joueur.get(cle_dimension) or "minecraft:overworld"), x, z


def marquer_joueurs(joueurs, lieux, reglage, maintenant=None):
    """Complète chaque joueur : actif ou non, et lieu de résidence déduit de son lit."""
    maintenant = maintenant or time.time()
    limite = maintenant - reglage["seuil_jours_actif"] * 86400
    for joueur in joueurs:
        heures = joueur.get("heures_jeu") or 0
        vu = joueur.get("derniere_activite") or 0
        joueur["is_actif"] = bool(heures >= reglage["seuil_heures_actif"] and vu >= limite)
        joueur["derniere_activite"] = dt.datetime.fromtimestamp(vu).isoformat() if vu else None
        residence = _position_joueur(joueur, "lit_x", "lit_z", "lit_dimension")
        if residence:
            lieu, distance = lieu_le_plus_proche(lieux, residence[0], residence[1], residence[2])
            if lieu and distance == 0:
                joueur["lieu_type"], joueur["lieu_id"], joueur["lieu_title"] = lieu["entity_type"], lieu["entity_id"], lieu["title"]
    return joueurs


def compter_joueurs(lieu, joueurs):
    """Joueurs dont la dernière position, puis le lit, se trouvent dans le lieu."""
    presents = residents = 0
    for joueur in joueurs:
        position = _position_joueur(joueur, "dernier_x", "dernier_z", "derniere_dimension")
        if position and position[0] == lieu.get("source") and dans_lieu(lieu, position[1], position[2]):
            presents += 1
        if joueur.get("lieu_type") == lieu["entity_type"] and joueur.get("lieu_id") == lieu["entity_id"]:
            residents += 1
    return presents, residents


# ---------------------------------------------------------------------------
# Relevé complet

# Mesures cumulables d'une ville vers sa civilisation
CHAMPS_CUMULES = ("population", "chunks", "chunks_actifs", "heures_presence", "lits", "lits_actifs",
                  "villageois", "joueurs_presents", "joueurs_residents")


def collecter(racine, sources, site=None, reglage=None, racine_serveur=None):
    """Lit la sauvegarde et construit le relevé à envoyer à l'API.

    racine  : dossier du monde (contenant level.dat)
    sources : dossiers des dimensions à lire ("" pour l'overworld, "DIM-1"…)
    """
    reglage = reglage or reglages()
    site = site or {"civilisations": [], "villes": [], "quartiers": [], "dimensions": [], "cartographies": []}
    debut = time.monotonic()
    seuil_ticks = reglage["seuil_heures_lit"] * TICKS_PAR_HEURE

    infos = mcworld.infos_monde(racine)
    dimensions_site = {dimension["id"]: dimension for dimension in site["dimensions"]}
    sources_site = sources_des_dimensions(site.get("cartes", []), site["dimensions"])
    lieux = lieux_du_site(site, sources_site, reglage)

    chunks_par_source = {}
    dimensions = []
    for source in sources:
        dossier = mcworld.dossier_dimension(racine, source)
        if not os.path.isdir(dossier):
            log("WARN", f"Dimension absente de la sauvegarde : {source or 'overworld'}")
            continue
        if not os.path.isdir(os.path.join(dossier, "entities")):
            log("WARN", f"{source or 'overworld'} : dossier entities absent, villageois et entités non comptés")
        log("STATS", f"Lecture de {source or 'overworld'}…")
        totaux, chunks = mcworld.lire_dimension(dossier)
        chunks_par_source[source] = chunks
        dimension_id = next((id_ for id_, valeur in sources_site.items() if valeur == source), None)
        dimensions.append({
            "source": source,
            "title": (dimensions_site.get(dimension_id) or {}).get("title") or (source or "Overworld"),
            "dimension_id": dimension_id,
            "chunks": totaux["chunks"],
            "chunks_actifs": sum(1 for case in chunks.values() if case["ticks"]),
            "heures_presence": round(totaux["ticks"] / TICKS_PAR_HEURE, 2),
            "lits": totaux["moities"] // MOITIES_PAR_LIT,
            "lits_actifs": sum(case["moities"] for case in chunks.values() if case["ticks"] >= seuil_ticks) // MOITIES_PAR_LIT,
            "villageois": totaux["villageois"],
            "entites": totaux["entites"],
            "taille_octets": totaux["octets"],
        })
        log("STATS", f"{source or 'overworld'} : {totaux['chunks']} chunks, "
                     f"{totaux['ticks'] / TICKS_PAR_HEURE:.0f} h de présence, "
                     f"{totaux['moities'] // MOITIES_PAR_LIT} lits, "
                     f"{totaux['villageois']} villageois")

    if not os.path.isdir(os.path.join(racine, "playerdata")):
        log("WARN", "playerdata absent : aucun joueur relevé")
    elif not os.path.isdir(os.path.join(racine, "stats")):
        log("WARN", "stats absent : temps de jeu, morts et distances des joueurs non relevés")
    noms = mcworld.lire_noms_joueurs(racine_serveur, os.path.dirname(racine.rstrip(os.sep)), racine)
    if not noms:
        log("WARN", "usercache.json introuvable : les pseudos viendront des comptes Minecraft liés sur le site")
    joueurs = marquer_joueurs(mcworld.lire_joueurs(racine, noms), lieux, reglage)

    lieux_mesures = []
    for lieu in lieux:
        chunks = chunks_par_source.get(lieu["source"], {}) if lieu["source"] is not None else {}
        mesures = mesurer_lieu(lieu, chunks, seuil_ticks)
        presents, residents = compter_joueurs(lieu, joueurs)
        lieux_mesures.append({
            "entity_type": lieu["entity_type"],
            "entity_id": lieu["entity_id"],
            "title": lieu["title"],
            "source": lieu.get("source"),
            "dimension_id": lieu.get("dimension_id"),
            "methode": lieu["methode"],
            "rayon": lieu["rayon"],
            "x": lieu.get("x"),
            "z": lieu.get("z"),
            # Population mesurée : les lits des chunks réellement fréquentés
            "population": mesures["lits_actifs"],
            "chunks": mesures["chunks"],
            "chunks_actifs": mesures["chunks_actifs"],
            "heures_presence": round(mesures["ticks"] / TICKS_PAR_HEURE, 2),
            "lits": mesures["lits"],
            "lits_actifs": mesures["lits_actifs"],
            "villageois": mesures["villageois"],
            "joueurs_presents": presents,
            "joueurs_residents": residents,
        })

    # Une civilisation sans frontières tracées reprend la somme des mesures de ses villes
    cumuls = {}
    for lieu, mesure in zip(lieux, lieux_mesures):
        if lieu["entity_type"] == "ville" and lieu.get("civilisation_id"):
            cumul = cumuls.setdefault(lieu["civilisation_id"], {champ: 0 for champ in CHAMPS_CUMULES})
            for champ in CHAMPS_CUMULES:
                cumul[champ] += mesure[champ] or 0
    for lieu, mesure in zip(lieux, lieux_mesures):
        if lieu["methode"] == "villes":
            mesure.update(cumuls.get(lieu["entity_id"], {champ: 0 for champ in CHAMPS_CUMULES}))
            mesure["heures_presence"] = round(mesure["heures_presence"], 2)

    zones = []
    for source, chunks in chunks_par_source.items():
        dimension_id = next((id_ for id_, valeur in sources_site.items() if valeur == source), None)
        for (x, z), tuile in tuiles(chunks, reglage["taille_tuile"], seuil_ticks).items():
            if not tuile["ticks"]:
                continue
            zones.append({
                "source": source,
                "dimension_id": dimension_id,
                "x": x,
                "z": z,
                "taille": reglage["taille_tuile"],
                "heures_presence": round(tuile["ticks"] / TICKS_PAR_HEURE, 2),
                "chunks": tuile["chunks"],
                "lits": tuile["lits"],
                "lits_actifs": tuile["lits_actifs"],
                "villageois": tuile["villageois"],
            })
    zones.sort(key=lambda zone: zone["heures_presence"], reverse=True)
    zones = zones[:reglage["zones_gardees"]]
    milieu = reglage["taille_tuile"] // 2
    for rang, zone in enumerate(zones, start=1):
        zone["rang"] = rang
        zone["joueurs"] = sum(
            1 for joueur in joueurs
            if (position := _position_joueur(joueur, "dernier_x", "dernier_z", "derniere_dimension"))
            and position[0] == zone["source"]
            and zone["x"] <= position[1] < zone["x"] + zone["taille"] and zone["z"] <= position[2] < zone["z"] + zone["taille"]
        )
        lieu, distance = lieu_le_plus_proche(lieux, zone["source"], zone["x"] + milieu, zone["z"] + milieu)
        if lieu:
            zone["lieu_type"], zone["lieu_id"] = lieu["entity_type"], lieu["entity_id"]
            zone["lieu_title"], zone["lieu_distance"] = lieu["title"], distance

    return {
        "source": "map-generator",
        "releve_at": dt.datetime.fromtimestamp(infos["temps"]).isoformat() if infos["temps"] else dt.datetime.now().isoformat(),
        "world_name": infos["nom"],
        "world_version": infos["version"],
        "data_version": infos["data_version"],
        "duration_seconds": round(time.monotonic() - debut, 2),
        "taille_octets": sum(dimension["taille_octets"] for dimension in dimensions),
        "seuil_heures_lit": reglage["seuil_heures_lit"],
        "seuil_jours_actif": reglage["seuil_jours_actif"],
        "seuil_heures_actif": reglage["seuil_heures_actif"],
        "taille_tuile": reglage["taille_tuile"],
        "dimensions": dimensions,
        "lieux": lieux_mesures,
        "zones": zones,
        "joueurs": joueurs,
    }


def envoyer(releve, base_url, cle):
    """Envoie le relevé à Shard-API (clé partagée platforms.monde.key)."""
    if not cle:
        raise RuntimeError("Clé d'envoi manquante : renseigner MAP_STATS_API_KEY (platforms.monde.key de Shard-API)")
    url = f"{base_url.rstrip('/')}/monde/releves"
    requete = urllib.request.Request(
        url,
        data=json.dumps(releve).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Monde-Key": cle},
        method="POST",
    )
    try:
        with urllib.request.urlopen(requete, timeout=120) as reponse:
            return json.loads(reponse.read().decode("utf-8"))
    except urllib.error.HTTPError as erreur:
        raise RuntimeError(f"{url} a répondu {erreur.code} : {ERREURS_ENVOI.get(erreur.code, erreur.reason)}") from erreur


# Causes habituelles d'un envoi refusé, expliquées dans le journal du générateur
ERREURS_ENVOI = {
    401: "clé refusée — MAP_STATS_API_KEY doit valoir platforms.monde.key de Shard-API",
    404: "route inconnue — vérifier que SHARD_API_BASE_URL se termine par /api",
    405: "route inconnue — redémarrer Shard-API pour charger /api/monde, et vérifier que SHARD_API_BASE_URL"
         " se termine par /api",
    422: "relevé refusé — le générateur et l'API ne sont pas de la même version",
}


def resume(releve):
    """Résumé lisible d'un relevé, pour le journal."""
    lignes = [f"{releve['world_name']} ({releve['world_version']}) lu en {releve['duration_seconds']} s"]
    for dimension in releve["dimensions"]:
        lignes.append(f"  {dimension['title']} : {dimension['chunks']} chunks, "
                      f"{dimension['heures_presence']:.0f} h de présence, {dimension['lits']} lits "
                      f"({dimension['lits_actifs']} fréquentés), {dimension['villageois']} villageois")
    actifs = [joueur for joueur in releve["joueurs"] if joueur.get("is_actif")]
    lignes.append(f"  {len(releve['joueurs'])} joueurs, dont {len(actifs)} actifs")
    for lieu in sorted(releve["lieux"], key=lambda lieu: lieu["heures_presence"], reverse=True)[:5]:
        lignes.append(f"  {lieu['entity_type']} {lieu['title']} : population {lieu['population']}, "
                      f"{lieu['heures_presence']:.0f} h, {lieu['lits']} lits, {lieu['joueurs_residents']} résidents")
    for zone in releve["zones"][:5]:
        lignes.append(f"  zone {zone['x']},{zone['z']} : {zone['heures_presence']:.0f} h, {zone['lits']} lits"
                      + (f" (près de {zone['lieu_title']}, {zone['lieu_distance']} blocs)" if zone.get("lieu_title") else ""))
    return "\n".join(lignes)


# ---------------------------------------------------------------------------

SITE_VIDE = {"civilisations": [], "villes": [], "quartiers": [], "dimensions": [], "cartographies": [], "cartes": []}


def relever(racine, sources=None, cartes=None, api_url="", cle="", racine_serveur=None, envoi=True):
    """Relevé complet : données du site, lecture de la sauvegarde, journal et envoi à l'API."""
    site = dict(SITE_VIDE)
    if api_url:
        try:
            site = charger_site(api_url)
        except (urllib.error.URLError, ValueError, OSError) as erreur:
            log("WARN", f"Données du site indisponibles ({erreur}) : mesures du monde seules")
    site["cartes"] = cartes or []
    if sources is None:
        sources = sorted({carte.get("source", "") for carte in site["cartes"]} or {""})

    releve = collecter(racine, sources, site, racine_serveur=racine_serveur)
    print(resume(releve))
    if envoi:
        if not api_url:
            log("WARN", "SHARD_API_BASE_URL absent : relevé non envoyé")
        else:
            reponse = envoyer(releve, api_url, cle)
            log("STATS", f"Relevé envoyé : {reponse.get('text', 'enregistré')}")
    return releve


def cartes_configurees(chemin=None):
    """Cartes déclarées dans maps.config.json : le lien d'une dimension du site y désigne un dossier du monde."""
    chemin = chemin or os.path.join(os.path.dirname(os.path.abspath(__file__)), "maps.config.json")
    if not os.path.exists(chemin):
        return []
    with open(chemin, encoding="utf-8") as fichier:
        return json.load(fichier).get("maps", [])


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--world", metavar="CHEMIN", help="dossier du monde (défaut : la copie de work/world)")
    parser.add_argument("--server", metavar="CHEMIN", help="dossier du serveur, pour usercache.json (pseudos)")
    parser.add_argument("--dimension", action="append", metavar="SOURCE", default=None,
                        help='dossier de dimension à lire ("" pour l\'overworld, DIM-1, DIM1…), répétable')
    parser.add_argument("--api-url", default=os.environ.get("SHARD_API_BASE_URL", ""), help="URL de Shard-API (avec /api)")
    parser.add_argument("--key", default=os.environ.get("MAP_STATS_API_KEY", ""), help="clé d'envoi (platforms.monde.key)")
    parser.add_argument("--json", metavar="FICHIER", help="écrire le relevé dans un fichier")
    parser.add_argument("--no-send", action="store_true", help="ne pas envoyer le relevé à l'API")
    args = parser.parse_args(argv)

    racine = os.path.abspath(os.path.expanduser(args.world)) if args.world else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "work", "world")
    if not os.path.exists(os.path.join(racine, "level.dat")):
        log("ERROR", f"level.dat introuvable dans {racine}")
        return 1

    try:
        releve = relever(racine, args.dimension, cartes_configurees(), args.api_url, args.key,
                         racine_serveur=args.server, envoi=not args.no_send)
    except (urllib.error.URLError, RuntimeError, ValueError, OSError) as erreur:
        log("ERROR", f"Relevé impossible : {erreur}")
        return 1

    if args.json:
        with open(args.json, "w", encoding="utf-8") as fichier:
            json.dump(releve, fichier, ensure_ascii=False, indent=1)
        log("STATS", f"Relevé écrit dans {args.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
