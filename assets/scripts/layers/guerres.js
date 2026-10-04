/**
 * Calque « Guerres » : zones de conflit (cartographies de type "guerre") des guerres publiques,
 * rouges pendant la guerre, grises une fois terminée (Shard-API /guerres/list, voir shard-api.js).
 * Les zones sont tracées dans l'éditeur ({dimension}-editor-civilisations?guerre=ID).
 *
 * S'y ajoutent les bâtiments (marqueurs à flamme) et zones (contour en pointillés) destructibles des villes
 * publiques (cartographies de type "destructible", tracées avec ?destructible=ID de la ville) : ce qu'une guerre RP
 * autorise à détruire. La popup signale une ville dont la civilisation est engagée dans une guerre en cours.
 * UI_BASE_URL est déclarée par shard-api.js.
 */

const GUERRE_ZONE_COLORS = { en_cours: "#b3263a", terminee: "#6b7280" };

async function fetchGuerresPosts(world) {
  const [guerres, cartographies, dimensions, civilisations] = await Promise.all([
    shardApiGet("/guerres/list"),
    shardApiGet("/cartographie/list?limit=1000"),
    shardApiGet("/cartographie/dimensions/read?limit=1000"),
    shardApiGetOptional("/civilisations/list?limit=1000", []),
  ]);

  const dimension = dimensions.find(
    (d) => (d.link || "").toLowerCase() === String(world).toLowerCase(),
  );

  // Villes des civilisations publiques : { ville, civilisation } par id de ville
  const villes = new Map();
  for (const { civilisation, villes: liste } of civilisations) {
    if (!civilisation.is_public) continue;
    for (const ville of liste || []) {
      if (ville.is_public !== false) villes.set(ville.id, { ville, civilisation });
    }
  }

  // Guerres en cours où chaque civilisation est engagée
  const enGuerre = new Map();
  for (const entry of guerres) {
    if (entry.guerre.status !== "en_cours") continue;
    for (const belligerant of [...(entry.camps.attaquant || []), ...(entry.camps.defenseur || [])]) {
      if (belligerant.status !== "engage" || belligerant.entite.type !== "civilisation") continue;
      const liste = enGuerre.get(belligerant.entite.id) || [];
      liste.push(entry.guerre);
      enGuerre.set(belligerant.entite.id, liste);
    }
  }

  const deLaDimension = (carto) => dimension && carto.dimension_id === dimension.id;
  return {
    dimension: dimension,
    guerres: new Map(guerres.map((entry) => [entry.guerre.id, entry])),
    zones: cartographies.filter((carto) => deLaDimension(carto) && carto.type === "guerre"),
    destructibles: cartographies.filter((carto) => deLaDimension(carto) && carto.type === "destructible" && villes.has(carto.type_id)),
    villes: villes,
    enGuerre: enGuerre,
  };
}

function destructiblePopup(element, { ville, civilisation }, guerres) {
  const genre = element.shape_type === "Marker" ? "Bâtiment" : "Zone";
  const menaces = guerres.length
    ? `<div class="flex flex-row gap-2"><span>Menacé:</span><span>${guerres.map((guerre) => `<a href="${UI_BASE_URL}/guerre/${guerre.id}" class="link">${escapeHtml(guerre.title)}</a>`).join(", ")}</span></div>`
    : "";
  return `
    <div class="flex flex-col gap-2">
      <div class="flex flex-row gap-2">
        <span>${genre} destructible:</span>
        <b>${escapeHtml(element.title || (genre === "Bâtiment" ? "Bâtiment sans nom" : "Zone sans nom"))}</b>
      </div>
      ${element.description ? `<span>${escapeHtml(element.description)}</span>` : ""}
      <div class="flex flex-row gap-2">
        <span>Ville:</span>
        <span>${escapeHtml(ville.title)} (${escapeHtml(civilisation.title)})</span>
      </div>
      ${menaces}
      <a href="${UI_BASE_URL}/civilisation/${civilisation.id}/ville/${ville.id}" class="btn btn-secondary btn-sm" style="color: white;">Voir la ville</a>
    </div>`;
}

function guerreCampLeader(camp) {
  const leader = (camp || []).find((b) => b.is_leader);
  return leader ? leader.entite.title : "?";
}

function guerrePopup(entry, zone) {
  const guerre = entry.guerre;
  return `
    <div class="flex flex-col gap-2">
      <div class="flex flex-row gap-2">
        <span>Guerre:</span>
        <b>${escapeHtml(guerre.title)}</b>
      </div>
      <div class="flex flex-row gap-2">
        <span>${guerre.status === "terminee" ? "Terminée" : "En cours"}:</span>
        <span>${escapeHtml(guerreCampLeader(entry.camps.attaquant))} contre ${escapeHtml(guerreCampLeader(entry.camps.defenseur))}</span>
      </div>
      ${zone.title && zone.title !== guerre.title ? `<b>${escapeHtml(zone.title)}</b>` : ""}
      ${zone.description ? `<span>${escapeHtml(zone.description)}</span>` : ""}
      <a href="${UI_BASE_URL}/guerre/${guerre.id}" class="btn btn-secondary btn-sm" style="color: white;">Voir la guerre</a>
    </div>`;
}

async function MarkersGuerres(world) {
  const datas = await fetchGuerresPosts(world);
  const polygons = [];
  const markers = [];
  if (!datas.dimension) {
    return { polygons: polygons, markers: markers };
  }

  for (const zone of datas.zones) {
    // Seules les guerres publiques (en cours ou terminées) sont renvoyées par /guerres/list
    const entry = datas.guerres.get(zone.type_id);
    if (!entry) continue;
    const color = entry.guerre.status === "terminee" ? GUERRE_ZONE_COLORS.terminee : zone.color || GUERRE_ZONE_COLORS.en_cours;
    const popup = guerrePopup(entry, zone);
    const tooltip = `<b class="">${escapeHtml(entry.guerre.title)}${zone.title && zone.title !== entry.guerre.title ? " - " + escapeHtml(zone.title) : ""}</b>`;

    if (zone.shape_type === "Marker") {
      markers.push({
        type: "Markers",
        dbid: zone.id,
        option: "guerre",
        coords: zone.coordinates,
        icon: CartographieMarkerIcon(color),
        popup: popup,
        tooltip: tooltip,
      });
    } else {
      polygons.push({
        type: zone.shape_type,
        dbid: zone.id,
        option: "guerre",
        coords: zone.coordinates,
        color: color,
        text: zone.text,
        popup: popup,
        tooltip: tooltip,
      });
    }
  }

  for (const element of datas.destructibles) {
    const lieu = datas.villes.get(element.type_id);
    const guerres = datas.enGuerre.get(lieu.civilisation.id) || [];
    const color = element.color || DestructibleDefaultColor;
    const popup = destructiblePopup(element, lieu, guerres);
    const nom = element.title || lieu.ville.title;
    const tooltip = `<b class="">${guerres.length ? "⚠ " : ""}Destructible · ${escapeHtml(nom)}</b>`;

    if (element.shape_type === "Marker") {
      markers.push({
        type: "Markers",
        dbid: element.id,
        option: "destructible",
        coords: element.coordinates,
        icon: DestructibleMarkerIcon(color),
        popup: popup,
        tooltip: tooltip,
      });
    } else {
      polygons.push({
        type: element.shape_type,
        dbid: element.id,
        option: "destructible",
        coords: element.coordinates,
        color: color,
        // Pointillés : à ne pas confondre avec une zone de conflit ; plus marqué quand la ville est menacée
        style: { dashArray: "6 6", weight: guerres.length ? 4 : 2, fillOpacity: guerres.length ? 0.35 : 0.15 },
        popup: popup,
        tooltip: tooltip,
      });
    }
  }

  return { polygons: polygons, markers: markers };
}
