/**
 * Marqueurs des magasins de commerces, à partir de Shard-API (voir shard-api.js).
 * Seuls les commerces et magasins publics situés dans la dimension affichée
 * sont montrés ; le siège de chaque commerce a sa propre icône.
 * UI_BASE_URL est déclaré par shard-api.js.
 */

const SiegeIcon = L.AwesomeMarkers.icon({
  prefix: "fa",
  icon: "building",
  iconColor: "#fff",
  markerColor: "darkpurple",
});

async function fetchCommercesPosts(world) {
  const [commerces, dimensions, villes] = await Promise.all([
    shardApiGet("/commerces/list?limit=1000"),
    shardApiGet("/cartographie/dimensions/read?limit=1000"),
    shardApiGet("/civilisations/villes/list?limit=1000"),
  ]);

  const dimension = dimensions.find(
    (d) => (d.link || "").toLowerCase() === String(world).toLowerCase(),
  );

  const posts = {
    commerces: commerces.filter((com) => com.commerce.is_public),
    villes: new Map(villes.map((ville) => [ville.id, ville])),
    dimension: dimension,
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

  const json = { polygons: polygons, markers: markers };
  return json;
}
