/**
 * Calque « Guerres » : zones de conflit (cartographies de type "guerre") des guerres publiques,
 * rouges pendant la guerre, grises une fois terminée (Shard-API /guerres/list, voir shard-api.js).
 * Les zones sont tracées dans l'éditeur ({dimension}-editor-civilisations?guerre=ID).
 * UI_BASE_URL est déclarée par shard-api.js.
 */

const GUERRE_ZONE_COLORS = { en_cours: "#dc2626", terminee: "#6b7280" };

async function fetchGuerresPosts(world) {
  const [guerres, cartographies, dimensions] = await Promise.all([
    shardApiGet("/guerres/list"),
    shardApiGet("/cartographie/list?limit=1000"),
    shardApiGet("/cartographie/dimensions/read?limit=1000"),
  ]);

  const dimension = dimensions.find(
    (d) => (d.link || "").toLowerCase() === String(world).toLowerCase(),
  );

  return {
    dimension: dimension,
    guerres: new Map(guerres.map((entry) => [entry.guerre.id, entry])),
    zones: cartographies.filter((carto) => dimension && carto.dimension_id === dimension.id && carto.type === "guerre"),
  };
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

  return { polygons: polygons, markers: markers };
}
