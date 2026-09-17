/**
 * Calque « Alliances » : villes et frontières des civilisations membres d'une alliance publique,
 * aux couleurs de leur alliance (Shard-API /alliances/list, voir shard-api.js).
 * Une civilisation membre de plusieurs alliances prend la couleur de son alliance militaire en priorité.
 * UI_BASE_URL est déclarée par shard-api.js.
 */

async function fetchAlliancesPosts(world) {
  const [alliances, civilisations, cartographies, dimensions] = await Promise.all([
    shardApiGet("/alliances/list"),
    shardApiGet("/civilisations/list?limit=1000"),
    shardApiGet("/cartographie/list?limit=1000"),
    shardApiGet("/cartographie/dimensions/read?limit=1000"),
  ]);

  const dimension = dimensions.find(
    (d) => (d.link || "").toLowerCase() === String(world).toLowerCase(),
  );

  const allianceOfCivilisation = new Map();
  const publiques = alliances
    .filter(({ alliance }) => alliance.is_public !== false)
    .sort((a, b) => Number(a.alliance.type !== "Militaire") - Number(b.alliance.type !== "Militaire"));
  for (const entry of publiques) {
    for (const membre of entry.membres) {
      if (!allianceOfCivilisation.has(membre.civilisation.id)) {
        allianceOfCivilisation.set(membre.civilisation.id, { ...entry, role: membre.role });
      }
    }
  }

  return {
    dimension: dimension,
    allianceOfCivilisation: allianceOfCivilisation,
    civilisations: civilisations.filter((civ) => civ.civilisation.is_public),
    cartographies: cartographies.filter((carto) => dimension && carto.dimension_id === dimension.id),
  };
}

function alliancePopup(entry, civilisation, ville) {
  return `
    <div class="flex flex-col gap-2">
      <div class="flex flex-row gap-2">
        <span>Alliance:</span>
        <b>${escapeHtml(entry.alliance.title)}</b>
      </div>
      <div class="flex flex-row gap-2">
        <span>Type:</span>
        <span>${escapeHtml(entry.alliance.type)}</span>
      </div>
      <div class="flex flex-row gap-2">
        <span>Civilisation:</span>
        <span>${escapeHtml(civilisation.title)} (${escapeHtml(entry.role)})</span>
      </div>
      ${ville ? `<div class="flex flex-row gap-2"><span>Ville:</span><span>${escapeHtml(ville.title)}</span></div>` : ""}
      <a href="${UI_BASE_URL}/alliance/${entry.alliance.id}" class="btn btn-secondary btn-sm" style="color: white;">Voir l'alliance</a>
      <a href="${UI_BASE_URL}/civilisation/${civilisation.id}" class="btn btn-secondary btn-sm" style="color: white;">Voir la civilisation</a>
    </div>`;
}

async function MarkersAlliances(world) {
  const datas = await fetchAlliancesPosts(world);
  const polygons = [];
  const markers = [];
  if (!datas.dimension) {
    return { polygons: polygons, markers: markers };
  }

  for (const { civilisation, villes } of datas.civilisations) {
    const entry = datas.allianceOfCivilisation.get(civilisation.id);
    if (!entry) continue;
    const color = entry.alliance.color || "#6b7280";

    for (const ville of villes || []) {
      if (ville.dimension_id !== datas.dimension.id || ville.is_public === false) continue;
      const popup = alliancePopup(entry, civilisation, ville);

      if (ville.x != null && ville.z != null) {
        markers.push({
          type: "Markers",
          option: "alliance",
          coords: JSON.stringify([-ville.z, ville.x]), // [-z, x]
          icon: CartographieMarkerIcon(color),
          popup: popup,
          tooltip: `<b class="">${escapeHtml(entry.alliance.title)} - ${escapeHtml(ville.title)}</b>`,
        });
      }

      datas.cartographies
        .filter((carto) => carto.type === "ville" && carto.type_id === ville.id && ["Polygon", "Rectangle"].includes(carto.shape_type))
        .forEach((polygon) => {
          polygons.push({
            type: polygon.shape_type,
            dbid: polygon.id,
            option: "alliance",
            coords: polygon.coordinates,
            color: color,
            text: polygon.text,
            popup: popup,
            tooltip: ``,
          });
        });
    }
  }

  return { polygons: polygons, markers: markers };
}
