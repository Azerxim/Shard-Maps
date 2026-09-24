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
const SHARD_API_BASE_URL =
  window.SHARD_API_BASE_URL || "http://localhost:8000/api";

// URL de ShardUI-2 pour les liens des popups, partagée par les scripts
// markers.*.js (une seule déclaration : ils peuvent être chargés ensemble).
const UI_BASE_URL = window.UI_BASE_URL || "http://localhost";

async function shardApiGet(path) {
  const headers = { "Content-Type": "application/json" };

  const response = await fetch(SHARD_API_BASE_URL + path, { headers });
  if (!response.ok) {
    throw new Error(
      "Shard-API " +
        path +
        " -> " +
        response.status +
        " " +
        response.statusText,
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
      shardApiAuthError() ||
        "Vous n'êtes pas connecté : ouvrez l'éditeur depuis le site Tetrago.",
    );
  }

  const send = (jwt) =>
    fetch(SHARD_API_BASE_URL + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + jwt,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  let response = await send(token);
  if (response.status === 401) {
    // Jeton expiré ou remplacé (nouvelle connexion sur le site) : le site en fournit un nouveau, on réessaie une fois
    const fresh = await shardApiToken({ refresh: true });
    if (fresh && fresh !== token) response = await send(fresh);
  }

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) {
      sessionStorage.removeItem("token");
      shardApiTokenPromise = null;
      throw new Error(
        "Session expirée : reconnectez-vous sur le site Tetrago, puis réessayez.",
      );
    }
    const detail = json && json.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : response.status + " " + response.statusText,
    );
  }
  return json;
}

// Jeton d'authentification de l'éditeur.
// ShardUI-2 et Shard-Maps sont servis sur des origines différentes : le
// localStorage n'est donc pas partagé. Quand l'éditeur est ouvert depuis
// ShardUI-2 (window.open), il demande le jeton à la page d'origine par postMessage :
//  - la demande ne contient rien de secret : elle part vers toute origine et est
//    répétée chaque seconde (15 s au plus), pour un onglet du site lent, rechargé
//    entre-temps ou servi sur une autre adresse (localhost / 127.0.0.1) ;
//  - la réponse n'est acceptée que de la fenêtre d'origine et d'une origine
//    autorisée (UI_BASE_URL, UI_ALLOWED_ORIGINS) ; sinon la raison est affichée ;
//  - le jeton est gardé dans le sessionStorage de l'onglet (survit aux rechargements),
//    un échec n'est pas mémorisé, et un jeton refusé par l'API (401) est redemandé.
const SHARD_API_TOKEN_RETRY_MS = 1000;
const SHARD_API_TOKEN_TIMEOUT_MS = 15000;
let shardApiTokenPromise = null;
let shardApiAuthErrorMessage = null;

// refresh : oublier le jeton gardé et en redemander un au site
function shardApiToken({ refresh = false } = {}) {
  if (refresh) {
    sessionStorage.removeItem("token");
    shardApiTokenPromise = null;
  }
  shardApiTokenPromise ??= shardApiRequestToken().then((token) => {
    if (!token) shardApiTokenPromise = null;
    return token;
  });
  return shardApiTokenPromise;
}

// Raison lisible du dernier échec de connexion de l'éditeur, ou null
function shardApiAuthError() {
  return shardApiAuthErrorMessage;
}

function shardApiRequestToken() {
  const stored = sessionStorage.getItem("token");
  if (stored) return Promise.resolve(stored);

  if (!window.opener || window.opener.closed) {
    // Carte servie sur la même origine que le site : même localStorage
    const local = localStorage.getItem("token");
    shardApiAuthErrorMessage = local
      ? null
      : "ouvrez l'éditeur depuis le site Tetrago pour vous connecter";
    return Promise.resolve(local);
  }

  const uiOrigins = shardApiAllowedUiOrigins();
  return new Promise((resolve) => {
    let finished = false;
    const finish = (token, error) => {
      if (finished) return;
      finished = true;
      clearInterval(retry);
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      shardApiAuthErrorMessage = token ? null : error;
      if (token) sessionStorage.setItem("token", token);
      resolve(token || null);
    };
    const onMessage = (event) => {
      if (event.source !== window.opener || event.data?.source !== "shardui")
        return;
      if (!uiOrigins.includes(event.origin)) {
        console.warn(
          "Éditeur : réponse ignorée de l'origine non autorisée " +
            event.origin,
        );
        finish(
          null,
          `le site ${event.origin} n'est pas autorisé à connecter l'éditeur : ajoutez-le à UI_ALLOWED_ORIGINS dans le .env de la carte`,
        );
        return;
      }
      if (event.data.type === "editor-auth-refused") {
        finish(
          null,
          event.data.reason || "le site a refusé de connecter l'éditeur",
        );
      } else if (event.data.type === "editor-auth") {
        finish(
          event.data.token,
          "vous n'êtes pas connecté sur le site Tetrago : connectez-vous, puis réessayez",
        );
      }
    };
    const ask = () => {
      if (!window.opener || window.opener.closed) {
        finish(
          null,
          "l'onglet du site qui a ouvert l'éditeur a été fermé : rouvrez l'éditeur depuis le site",
        );
        return;
      }
      window.opener.postMessage(
        { source: "minedmap", type: "editor-auth-request" },
        "*",
      );
    };

    window.addEventListener("message", onMessage);
    const retry = setInterval(ask, SHARD_API_TOKEN_RETRY_MS);
    const timeout = setTimeout(
      () =>
        finish(
          null,
          "le site Tetrago ne répond pas : gardez son onglet ouvert, puis réessayez",
        ),
      SHARD_API_TOKEN_TIMEOUT_MS,
    );
    ask();
  });
}

// UI_BASE_URL + UI_ALLOWED_ORIGINS (séparées par des virgules), voir .env.example
function shardApiAllowedUiOrigins() {
  const urls = [
    window.UI_BASE_URL,
    ...String(window.UI_ALLOWED_ORIGINS || "").split(","),
  ];
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
