/**
 * Marqueurs des magasins de commerces, à partir de Shard-API (voir shard-api.js).
 * Seuls les commerces et magasins publics situés dans la dimension affichée
 * sont montrés ; le siège de chaque commerce a sa propre icône.
 *
 * S'y ajoutent les zones commerciales des villes publiques (cartographies de type "commerciale", tracées avec
 * ?commerciale=ID de la ville) : marchés et quartiers marchands, dont la popup liste les boutiques situées à l'intérieur.
 * Chaque zone a aussi un marqueur à son centre, à son nom, pour la repérer même dézoomé, et sa popup donne ses jours
 * de marché. Les foires à venir des villes publiques (Shard-API /marches/list) ont chacune leur marqueur.
 * UI_BASE_URL est déclaré par shard-api.js.
 */

var ZoneCommercialeDefaultColor = "#e3a82b";
var JoursSemaine = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

// [5] → « le samedi » ; [2, 5] → « le mercredi et le samedi » (même règle que ShardUI-2, config/marches.js)
function joursTexte(jours) {
  if (!jours || jours.length === 0) return "";
  if (jours.length === 7) return "tous les jours";
  const noms = jours.map((jour) => `le ${JoursSemaine[jour]}`);
  return noms.length === 1 ? noms[0] : `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}`;
}

// « le samedi 10 octobre 2026 » ou « du vendredi 9 octobre 2026 au samedi 10 octobre 2026 » (dates ISO, heure locale)
function periodeFoire(foire) {
  const date = (iso) => {
    const [annee, mois, jour] = String(iso).split("-").map(Number);
    return new Date(annee, mois - 1, jour).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };
  return foire.date_fin && foire.date_fin !== foire.date_debut ? `du ${date(foire.date_debut)} au ${date(foire.date_fin)}` : `le ${date(foire.date_debut)}`;
}

// Point [-z, x] dans un polygone [[-z, x], …] (lancer de rayon)
function pointDansZone(point, sommets) {
  let dedans = false;
  for (let i = 0, j = sommets.length - 1; i < sommets.length; j = i++) {
    const [yi, xi] = sommets[i];
    const [yj, xj] = sommets[j];
    if (yi > point[0] !== yj > point[0] && point[1] < ((xj - xi) * (point[0] - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

const SiegeIcon = L.AwesomeMarkers.icon({
  prefix: "fa",
  icon: "building",
  iconColor: "#fff",
  markerColor: "darkpurple",
});

async function fetchCommercesPosts(world) {
  const [commerces, dimensions, villes, cartographies, marches] = await Promise.all([
    shardApiGet("/commerces/list?limit=1000"),
    shardApiGet("/cartographie/dimensions/read?limit=1000"),
    shardApiGet("/civilisations/villes/list?limit=1000"),
    shardApiGetOptional("/cartographie/list?limit=1000", []),
    shardApiGetOptional("/marches/list", { jours: [], foires: [] }),
  ]);

  const dimension = dimensions.find(
    (d) => (d.link || "").toLowerCase() === String(world).toLowerCase(),
  );

  const villesPubliques = new Map(villes.filter((ville) => ville.is_public !== false).map((ville) => [ville.id, ville]));
  const posts = {
    commerces: commerces.filter((com) => com.commerce.is_public),
    villes: new Map(villes.map((ville) => [ville.id, ville])),
    dimension: dimension,
    zones: cartographies.filter((carto) => carto.type === "commerciale" && dimension && carto.dimension_id === dimension.id && villesPubliques.has(carto.type_id)),
    jours: new Map((marches.jours || []).map((marche) => [marche.cartographie_id, marche])),
    foires: (marches.foires || []).filter((foire) => dimension && foire.dimension_id === dimension.id && foire.x != null && foire.z != null),
  };

  return posts;
}

async function MarkersCommerces(world) {
  const datas = await fetchCommercesPosts(world);
  let polygons = [];
  let markers = [];
  let popup, tooltip;

  if (!datas.dimension) {
    return { polygons: polygons, markers: markers };
  }

  for (const { commerce, fondateur, magasins } of datas.commerces) {
    for (const magasin of magasins || []) {
      if (!magasin.is_public || magasin.dimension_id !== datas.dimension.id) continue;
      if (magasin.x == null || magasin.z == null) continue;

      const ville = datas.villes.get(magasin.ville_id);
      popup = `
        <div class="flex flex-col gap-2">
          <div class="flex flex-row gap-2">
            <span>Commerce:</span>
            <b>${escapeHtml(commerce.title)}</b>
          </div>
          <div class="flex flex-row gap-2">
            <span>${magasin.is_siege ? "Siège" : "Magasin"}:</span>
            <span>${escapeHtml(magasin.title)}</span>
          </div>
          ${ville ? `<div class="flex flex-row gap-2"><span>Ville:</span><span>${escapeHtml(ville.title)}</span></div>` : ""}
          ${fondateur ? `<div class="flex flex-row gap-2"><span>Fondateur:</span><span>${escapeHtml(fondateur.full_name || fondateur.username)}</span></div>` : ""}
          ${magasin.description ? `<span>${escapeHtml(magasin.description)}</span>` : ""}
          <a href="${UI_BASE_URL}/commerce/${commerce.id}" class="btn btn-secondary btn-sm" style="color: white;">Voir le commerce</a>
        </div>`;
      tooltip = `<b class="">${escapeHtml(commerce.title)} - ${escapeHtml(magasin.title)}</b>`;

      markers.push({
        type: "Markers",
        dbid: magasin.id,
        option: "commerce",
        coords: "[" + parseInt(-1 * magasin.z) + "," + parseInt(magasin.x) + "]",
        icon: magasin.is_siege ? SiegeIcon : ShopIcon,
        popup: popup,
        tooltip: tooltip,
      });
    }
  }

  // Zones commerciales : les boutiques qui s'y tiennent sont les magasins publics situés à l'intérieur
  const boutiques = [];
  for (const { commerce, magasins } of datas.commerces) {
    for (const magasin of magasins || []) {
      if (magasin.is_public && magasin.dimension_id === datas.dimension.id && magasin.x != null && magasin.z != null) {
        boutiques.push({ commerce, magasin, point: [-magasin.z, magasin.x] });
      }
    }
  }
  for (const zone of datas.zones) {
    let sommets;
    try {
      sommets = JSON.parse(zone.coordinates);
    } catch {
      continue;
    }
    const ville = datas.villes.get(zone.type_id);
    const dedans = boutiques.filter((boutique) => pointDansZone(boutique.point, sommets));
    const marche = datas.jours.get(zone.id);
    const ouverture = marche ? [joursTexte(marche.jours) && `Ouvert ${joursTexte(marche.jours)}`, marche.horaires].filter(Boolean).join(", ") : "";
    const liste = dedans.length
      ? `<ul style="margin:0;padding-left:1.1rem;list-style:disc">${dedans.map(({ commerce, magasin }) => `<li><a href="${UI_BASE_URL}/commerce/${commerce.id}" class="link">${escapeHtml(magasin.title)}</a> (${escapeHtml(commerce.title)})</li>`).join("")}</ul>`
      : "<i>Aucune boutique pour l'instant.</i>";
    popup = `
      <div class="flex flex-col gap-2">
        <div class="flex flex-row gap-2">
          <span>Zone commerciale:</span>
          <b>${escapeHtml(zone.title || "Sans nom")}</b>
        </div>
        ${zone.description ? `<span>${escapeHtml(zone.description)}</span>` : ""}
        ${ouverture ? `<span><b>${escapeHtml(ouverture)}</b></span>` : ""}
        ${ville ? `<div class="flex flex-row gap-2"><span>Ville:</span><span>${escapeHtml(ville.title)}</span></div>` : ""}
        <div class="flex flex-col gap-1"><span>Boutiques (${dedans.length}):</span>${liste}</div>
        ${ville ? `<a href="${UI_BASE_URL}/civilisation/${ville.civilisation_id}/ville/${ville.id}" class="btn btn-secondary btn-sm" style="color: white;">Voir la ville</a>` : ""}
      </div>`;
    const color = zone.color || ZoneCommercialeDefaultColor;
    const tooltip = `<b class="">${escapeHtml(zone.title || "Zone commerciale")} · ${dedans.length} boutique${dedans.length > 1 ? "s" : ""}</b>`;
    polygons.push({
      type: zone.shape_type,
      dbid: zone.id,
      option: "commerciale",
      coords: zone.coordinates,
      color: color,
      style: { weight: 3, fillOpacity: 0.3 },
      popup: popup,
      tooltip: tooltip,
    });
    // Marqueur au centre des sommets
    const centre = [0, 1].map((i) => sommets.reduce((total, sommet) => total + sommet[i], 0) / sommets.length);
    markers.push({
      type: "Markers",
      dbid: zone.id,
      option: "commerciale",
      coords: JSON.stringify(centre),
      icon: ZoneCommercialeMarkerIcon(color),
      popup: popup,
      tooltip: tooltip,
    });
  }

  // Foires à venir ou en cours : dans leur zone commerciale, sinon au centre de la ville
  for (const foire of datas.foires) {
    const ville = foire.ville;
    popup = `
      <div class="flex flex-col gap-2">
        <div class="flex flex-row gap-2">
          <span>Foire:</span>
          <b>${escapeHtml(foire.title)}</b>
        </div>
        <span>${escapeHtml(periodeFoire(foire))}${foire.horaires ? `, ${escapeHtml(foire.horaires)}` : ""}</span>
        ${ville ? `<div class="flex flex-row gap-2"><span>Ville:</span><span>${escapeHtml(ville.title)}</span></div>` : ""}
        ${foire.zone ? `<div class="flex flex-row gap-2"><span>Lieu:</span><span>${escapeHtml(foire.zone.title || "Zone commerciale")}</span></div>` : ""}
        ${foire.description ? `<span>${escapeHtml(foire.description)}</span>` : ""}
        ${ville ? `<a href="${UI_BASE_URL}/civilisation/${ville.civilisation_id}/ville/${ville.id}#marches" class="btn btn-secondary btn-sm" style="color: white;">Voir la ville</a>` : ""}
      </div>`;
    markers.push({
      type: "Markers",
      dbid: foire.id,
      option: "foire",
      coords: "[" + parseInt(-1 * foire.z) + "," + parseInt(foire.x) + "]",
      icon: FoireMarkerIcon(),
      popup: popup,
      tooltip: `<b class="">Foire : ${escapeHtml(foire.title)}</b>`,
    });
  }

  const json = { polygons: polygons, markers: markers };
  return json;
}
