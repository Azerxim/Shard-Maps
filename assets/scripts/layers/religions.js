/**
 * Couche "religions" construite à partir de Shard-API (voir shard-api.js).
 *
 * Pour chaque ville (publique) de la dimension affichée : les religions
 * présentes et leur influence (/religions/list). Le marqueur et la frontière
 * de la ville prennent la couleur de la religion majoritaire ; la popup
 * détaille la répartition. Couleurs identiques à ShardUI-2 (ReligionColor,
 * voir markers.js). Seules les religions publiques sont affichées.
 * Les villes sans religion (publique) sont affichées en gris.
 */

const SANS_RELIGION_COLOR = "#9ca3af";

async function fetchReligionsPosts(world) {
  const [religions, cartographies, dimensions, villes] = await Promise.all([
    shardApiGet("/religions/list?limit=1000"),
    shardApiGet("/cartographie/list?limit=1000"),
    shardApiGet("/cartographie/dimensions/read?limit=1000"),
    // Toutes les villes, pour afficher aussi celles sans religion (sans bloquer la couche en cas d'erreur)
    shardApiGet("/civilisations/villes/list?limit=1000").catch((error) => {
      console.error(error);
      return [];
    }),
  ]);

  const dimension = dimensions.find(
    (d) => (d.link || "").toLowerCase() === String(world).toLowerCase(),
  );
  const dimensionId = dimension ? dimension.id : null;

  return {
    religions: religions.filter((rel) => rel.religion.is_public),
    cartographies: cartographies.filter(
      (carto) => carto.dimension_id === dimensionId && carto.type === "ville",
    ),
    villes: villes,
    dimension: dimension,
  };
}

// Regroupe les religions par ville, triées par influence décroissante.
// Chaque ville publique de la dimension est présente, avec une liste vide si elle n'a aucune religion.
function religionsByVille(datas) {
  const villes = new Map();

  for (const ville of datas.villes) {
    if (!datas.dimension || ville.dimension_id !== datas.dimension.id) continue;
    if (ville.is_public === false) continue;
    villes.set(ville.id, { ville, religions: [] });
  }

  for (const data of datas.religions) {
    for (const { ville, villes_religions } of data.villes) {
      if (!datas.dimension || ville.dimension_id !== datas.dimension.id) continue;
      if (ville.is_public === false) continue;

      const entry = villes.get(ville.id) ?? { ville, religions: [] };
      entry.religions.push({ ...data.religion, influence: villes_religions.influence });
      villes.set(ville.id, entry);
    }
  }

  for (const entry of villes.values()) {
    entry.religions.sort((a, b) => (b.influence ?? 0) - (a.influence ?? 0));
  }
  return villes;
}

function formatInfluence(influence) {
  if (influence == null) return "?";
  return `${Number(influence).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

function religionsPopup(ville, religions) {
  const rows = religions.length === 0
    ? `<span class="italic" style="opacity: 0.7;">Aucune religion</span>`
    : religions
    .map((religion) => {
      const color = ReligionColor(religion);
      const width = Math.min(100, Math.max(0, religion.influence ?? 0));
      return `
        <a href="${UI_BASE_URL}/religion/${religion.id}" class="flex flex-col gap-1" style="color: inherit; text-decoration: none;">
          <div class="flex flex-row items-center gap-2">
            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 9999px; background-color: ${color};"></span>
            <span class="flex-1 font-bold">${escapeHtml(religion.title)}</span>
            <span>${formatInfluence(religion.influence)}</span>
          </div>
          <div style="height: 6px; border-radius: 9999px; background-color: rgba(127, 127, 127, 0.25); overflow: hidden;">
            <div style="height: 100%; width: ${width}%; background-color: ${color};"></div>
          </div>
        </a>`;
    })
    .join("");

  return `
    <div class="flex flex-col gap-2" style="min-width: 200px;">
      <div class="flex flex-row gap-2">
        <span>Ville:</span>
        <b>${escapeHtml(ville.title)}</b>
      </div>
      ${rows}
      <a href="${UI_BASE_URL}/civilisation/${ville.civilisation_id}/ville/${ville.id}" class="btn btn-secondary btn-sm" style="color: white;">Voir la ville</a>
    </div>`;
}

async function MarkersReligions(world) {
  const datas = await fetchReligionsPosts(world);
  const polygons = [];
  const markers = [];

  for (const { ville, religions } of religionsByVille(datas).values()) {
    const dominant = religions[0];
    const color = dominant ? ReligionColor(dominant) : SANS_RELIGION_COLOR;
    const popup = religionsPopup(ville, religions);
    const tooltip = dominant
      ? `<b class="">${escapeHtml(ville.title)} - ${escapeHtml(dominant.title)} (${formatInfluence(dominant.influence)})</b>`
      : `<b class="">${escapeHtml(ville.title)} - Sans religion</b>`;

    // Marqueur Ville
    if (ville.x != null && ville.z != null) {
      markers.push({
        type: "Markers",
        option: "religion",
        coords: JSON.stringify([-ville.z, ville.x]), // [-z, x]
        icon: ReligionIcon(color),
        popup: popup,
        tooltip: tooltip,
      });
    }

    // Frontières Ville, colorées selon la religion majoritaire
    datas.cartographies
      .filter((carto) => carto.type_id === ville.id && ["Polygon", "Rectangle"].includes(carto.shape_type))
      .forEach((carto) => {
        polygons.push({
          type: carto.shape_type,
          dbid: carto.id,
          option: "religion",
          coords: carto.coordinates,
          color: color,
          popup: popup,
          tooltip: tooltip,
        });
      });
  }

  return { polygons: polygons, markers: markers };
}
