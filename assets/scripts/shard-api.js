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

// URL de ShardUI-2 pour les liens des popups, partagée par les scripts
// markers.*.js (une seule déclaration : ils peuvent être chargés ensemble).
const UI_BASE_URL = window.UI_BASE_URL || "http://localhost";

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

// Requête authentifiée (POST / PUT / DELETE). En cas d'erreur, le message
// renvoyé par Shard-API (champ `detail`) est remonté dans l'exception.
async function shardApiRequest(method, path, body) {
  const token = await shardApiToken();
  if (!token) {
    throw new Error(
      "Vous n'êtes pas connecté : ouvrez l'éditeur depuis le site Tetrago."
    );
  }

  const response = await fetch(SHARD_API_BASE_URL + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) sessionStorage.removeItem("token");
    const detail = json && json.detail;
    throw new Error(
      typeof detail === "string" ? detail : response.status + " " + response.statusText
    );
  }
  return json;
}

// Jeton d'authentification de l'éditeur.
// ShardUI-2 et ShardUI-2-Maps sont servis sur des origines différentes : le
// localStorage n'est donc pas partagé. Quand l'éditeur est ouvert depuis
// ShardUI-2 (window.open), il demande le jeton à la page d'origine par
// postMessage, en n'acceptant que les réponses venant de UI_BASE_URL. Le jeton
// est ensuite conservé dans le sessionStorage de l'onglet (survit aux
// rechargements après sauvegarde).
let shardApiTokenPromise = null;

function shardApiToken() {
  shardApiTokenPromise ??= shardApiRequestToken();
  return shardApiTokenPromise;
}

function shardApiRequestToken() {
  const stored = sessionStorage.getItem("token") || localStorage.getItem("token");
  if (stored) return Promise.resolve(stored);
  const uiOrigins = shardApiAllowedUiOrigins();
  if (!window.opener || uiOrigins.length === 0) return Promise.resolve(null);

  return new Promise((resolve) => {
    const finish = (token) => {
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve(token);
    };
    const onMessage = (event) => {
      if (!uiOrigins.includes(event.origin) || event.source !== window.opener) return;
      if (event.data?.source !== "shardui" || event.data?.type !== "editor-auth") return;
      if (event.data.token) sessionStorage.setItem("token", event.data.token);
      finish(event.data.token || null);
    };
    const timeout = setTimeout(() => finish(null), 5000);

    window.addEventListener("message", onMessage);
    // L'origine de l'opener n'est pas lisible : on envoie la demande à chaque
    // origine autorisée, le navigateur ne la délivre qu'à celle qui correspond.
    for (const uiOrigin of uiOrigins) {
      window.opener.postMessage({ source: "minedmap", type: "editor-auth-request" }, uiOrigin);
    }
  });
}

// UI_BASE_URL + UI_ALLOWED_ORIGINS (séparées par des virgules), voir .env.example
function shardApiAllowedUiOrigins() {
  const urls = [window.UI_BASE_URL, ...String(window.UI_ALLOWED_ORIGINS || "").split(",")];
  const origins = [];
  for (const url of urls) {
    try {
      if (url && url.trim()) origins.push(new URL(url.trim()).origin);
    } catch (e) {
      console.warn("Origine UI invalide ignorée : " + url);
    }
  }
  return [...new Set(origins)];
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
