/**
 * Petit client HTTP pour Shard-API (FastAPI, voir /Shard-API).
 *
 * Ce fichier remplace les anciens scripts PHP de assets/api/get/*.php qui
 * interrogeaient directement la base MySQL "mcrp" côté serveur (via une
 * session PHP pour l'autorisation). Les données viennent maintenant de
 * Shard-API et l'agrégation se fait ici, côté navigateur.
 *
 * Base URL : lue dans `window.SHARD_API_BASE_URL`, défini par
 * assets/scripts/env.js — un fichier généré au démarrage (voir
 * start-nginx-local.sh) à partir de la variable SHARD_API_BASE_URL du
 * fichier .env (voir .env.example). Charger env.js AVANT ce script.
 * Sans env.js, on retombe sur http://localhost:8000/api (port par défaut de
 * Shard-API en dev, voir Shard-API/config.json.template).
 *
 * Authentification : le jeton est lu dans localStorage sous la clé "token",
 * exactement comme le fait ShardUI-2 (voir ShardUI-2/src/services/api.js).
 * Si les deux applications partagent le même domaine (ou un sous-domaine
 * avec le même localStorage), un visiteur connecté sur le site principal
 * est donc automatiquement reconnu ici. Sans jeton, les appels se font en
 * anonyme (comme un visiteur non connecté côté PHP).
 */
const SHARD_API_BASE_URL = window.SHARD_API_BASE_URL || "http://localhost:8000/api";

async function shardApiGet(path) {
  const headers = { "Content-Type": "application/json" };

  const response = await fetch(SHARD_API_BASE_URL + path, { headers });
  if (!response.ok) {
    throw new Error(
      "Shard-API " + path + " -> " + response.status + " " + response.statusText
    );
  }
  const json = await response.json();
  // console.log("Shard-API GET " + SHARD_API_BASE_URL + path + " -> " + JSON.stringify(json));
  return json;
}

// Renvoie l'utilisateur courant (via /users/me), ou null si non connecté /
// jeton invalide. Ne fait jamais échouer l'appelant.
async function shardApiCurrentUser() {
  if (!localStorage.getItem("token")) {
    return null;
  }
  try {
    return await shardApiGet("/users/me");
  } catch (e) {
    return null;
  }
}
