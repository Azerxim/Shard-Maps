/**
 * Reconstruit, côté navigateur, la structure jadis produite par
 * assets/api/get/civilisations.php à partir de Shard-API (voir shard-api.js).
 *
 * Limites connues par rapport à l'ancien script PHP, faute d'équivalent
 * dans le nouveau modèle de données (Shard-API/api/db/models.py) :
 *  - `inactif` (civilisation/ville) n'existe plus : toujours considéré actif.
 *  - `parc` (ville/quartier) n'existe plus : toujours considéré à "0".
 * Ajuster ce mapping si ces champs sont réintroduits côté API.
 */

// Données facultatives : leur échec ne doit pas empêcher l'affichage des civilisations
function shardApiGetOptional(path, fallback) {
  return shardApiGet(path).catch((error) => {
    console.error(error);
    return fallback;
  });
}

// Ligne « Habitants » des popups : personnages dont la résidence est cette ville ou ce quartier
function habitantsLine(count) {
  if (!count) return "";
  return `
        <div class="flex flex-row gap-2">
          <span>Habitants:</span>
          <span>${count} personnage${count > 1 ? "s" : ""}</span>
        </div>`;
}

async function fetchCivilisationsPosts(world) {
  const [civilisations, cartographies, dimensions, currentUser, quartiers, habitantsVilles, habitantsQuartiers] =
    await Promise.all([
      shardApiGet("/civilisations/list?limit=1000"),
      shardApiGet("/cartographie/list?limit=1000"),
      shardApiGet("/cartographie/dimensions/read?limit=1000"),
      shardApiCurrentUser(),
      shardApiGetOptional("/civilisations/quartiers/list?limit=1000", []),
      // { id de la ville (ou du quartier): nombre de personnages }
      shardApiGetOptional("/personnages/habitants/ville", {}),
      shardApiGetOptional("/personnages/habitants/quartier", {}),
    ]);

  const dimension = dimensions.find(
    (d) => (d.link || "").toLowerCase() === String(world).toLowerCase(),
  );
  const dimensionId = dimension ? dimension.id : null;

  console.log({
    civilisations: civilisations,
    cartographies: cartographies,
    dimensions: dimensions,
    currentUser: currentUser,
    dimension: dimension,
  });

  const posts = {
    civilisations: civilisations.filter((civ) => civ.civilisation.is_public),
    cartographies: cartographies.filter(
      (carto) => carto.dimension_id === dimensionId,
    ),
    dimension: dimension,
    quartiers: quartiers.filter((quartier) => quartier.is_public !== false),
    habitants: { villes: habitantsVilles || {}, quartiers: habitantsQuartiers || {} },
  };

  return posts;
}

async function MarkersCivilisations(world) {
  const datas = await fetchCivilisationsPosts(world);
  let polygons = [];
  let markers = [];
  let popup, tooltip, icon;
  // console.log({ world: world, datas: datas });

  for (const one in datas.civilisations) {
    let data = datas.civilisations[one];
    let civilisation = data.civilisation;
    let civ_carto = datas.cartographies.filter(
      (carto) =>
        carto.type_id === civilisation.id && carto.type === "civilisation",
    );
    let villes = data.villes;

    // Marqueurs (et éventuels polygones) de la civilisation
    civ_carto.forEach((carto) => {
      popup = `
          <div class="flex flex-col gap-2">
            <div class="flex flex-row gap-2">
              <span>Civilisation:</span>
              <span>${escapeHtml(civilisation.title)}</span>
            </div>
            ${carto.title ? `<b>${escapeHtml(carto.title)}</b>` : ""}
            ${carto.description ? `<span>${escapeHtml(carto.description)}</span>` : ""}
            <a href="${UI_BASE_URL}/civilisation/${civilisation.id}" class="btn btn-secondary btn-sm" style="color: white;">Voir la civilisation</a>
          </div>`;
      tooltip = `<b class="">${escapeHtml(civilisation.title)}${carto.title ? " - " + escapeHtml(carto.title) : ""}</b>`;

      if (carto.shape_type === "Marker") {
        markers.push({
          type: "Markers",
          dbid: carto.id,
          option: "civ",
          coords: carto.coordinates,
          icon: CartographieMarkerIcon(carto.color),
          popup: popup,
          tooltip: tooltip,
        });
      } else {
        polygons.push({
          type: carto.shape_type,
          dbid: carto.id,
          option: "civ",
          coords: carto.coordinates,
          color: carto.color,
          text: carto.text,
          popup: popup,
          tooltip: tooltip,
        });
      }
    });

    // Villes (uniquement celles de la dimension affichée)
    for (let ville in villes) {
      let subdata = villes[ville];
      if (!datas.dimension || subdata.dimension_id !== datas.dimension.id) continue;
      popup = `
      <div class="flex flex-col gap-2">
        <div class="flex flex-row gap-2">
          <span>Civilisation:</span>
          <span>${escapeHtml(civilisation.title)}</span>
        </div>
        <div class="flex flex-row gap-2">
          <span>Ville:</span>
          <span>${escapeHtml(subdata.title)}</span>
        </div>${habitantsLine(datas.habitants.villes[subdata.id])}
        <a href="${UI_BASE_URL}/civilisation/${civilisation.id}/ville/${subdata.id}" class="btn btn-secondary btn-sm" style="color: white;">Voir la ville</a>
        <a href="${UI_BASE_URL}/civilisation/${civilisation.id}" class="btn btn-secondary btn-sm" style="color: white;">Voir la civilisation</a>
      </div>`;
      tooltip = `<b class="">${escapeHtml(civilisation.title)} - ${escapeHtml(subdata.title)}</b>`;
      if (subdata.is_capital == "1") {
        icon = CapitaleIcon;
      } else {
        icon = CityIcon;
      }

      // Marker Ville
      markers.push({
        type: "Markers",
        option: "civ",
        // authorisation: data.authorisation,
        coords:
          "[" + parseInt(-1 * subdata.z) + "," + parseInt(subdata.x) + "]",
        icon: icon,
        popup: popup,
        tooltip: tooltip,
      });

      // Frontières Ville
      let ville_carto = datas.cartographies.filter(
        (carto) => carto.type_id === subdata.id && carto.type === "ville",
      );
      ville_carto.forEach((polygon) => {
        popup = `
          <div class="flex flex-col gap-2">
            <div class="flex flex-row gap-2">
              <span>Ville:</span>
              <span>${escapeHtml(subdata.title)}</span>
            </div>
            ${polygon.title && polygon.title !== subdata.title ? `<b>${escapeHtml(polygon.title)}</b>` : ""}
            ${polygon.description ? `<span>${escapeHtml(polygon.description)}</span>` : ""}${habitantsLine(datas.habitants.villes[subdata.id])}
            <a href="${UI_BASE_URL}/civilisation/${civilisation.id}/ville/${subdata.id}" class="btn btn-secondary btn-sm" style="color: white;">Voir la ville</a>
            <a href="${UI_BASE_URL}/civilisation/${civilisation.id}" class="btn btn-secondary btn-sm" style="color: white;">Voir la civilisation</a>
          </div>`;
        tooltip = ``;
        polygons.push({
          type: polygon.shape_type,
          dbid: polygon.id,
          option: "civ",
          // authorisation: data.authorisation,
          coords: polygon.coordinates,
          color: polygon.color,
          text: polygon.text,
          icon: icon,
          popup: popup,
          tooltip: tooltip,
        });
      });

      // Quartiers de la ville : marqueur au centre et frontières
      const quartiers = datas.quartiers.filter((quartier) => quartier.ville_id === subdata.id);
      for (const quartier of quartiers) {
        const quartierPopup = `
          <div class="flex flex-col gap-2">
            <div class="flex flex-row gap-2">
              <span>Ville:</span>
              <span>${escapeHtml(subdata.title)}</span>
            </div>
            <div class="flex flex-row gap-2">
              <span>Quartier:</span>
              <b>${escapeHtml(quartier.title)}</b>
            </div>${habitantsLine(datas.habitants.quartiers[quartier.id])}
            <a href="${UI_BASE_URL}/quartier/${quartier.id}" class="btn btn-secondary btn-sm" style="color: white;">Voir le quartier</a>
            <a href="${UI_BASE_URL}/civilisation/${civilisation.id}/ville/${subdata.id}" class="btn btn-secondary btn-sm" style="color: white;">Voir la ville</a>
          </div>`;

        if (quartier.x != null && quartier.z != null) {
          markers.push({
            type: "Markers",
            option: "quartier",
            coords: JSON.stringify([-quartier.z, quartier.x]), // [-z, x]
            icon: QuartierIcon,
            popup: quartierPopup,
            tooltip: `<b class="">${escapeHtml(subdata.title)} - ${escapeHtml(quartier.title)}</b>`,
          });
        }

        datas.cartographies
          .filter((carto) => carto.type === "quartier" && carto.type_id === quartier.id)
          .forEach((polygon) => {
            polygons.push({
              type: polygon.shape_type,
              dbid: polygon.id,
              option: "quartier",
              coords: polygon.coordinates,
              color: polygon.color,
              text: polygon.text,
              popup: quartierPopup,
              tooltip: ``,
            });
          });
      }
    }
  }

  const json = { polygons: polygons, markers: markers };
  return json;
}

async function oldMarkersCivilisations(world) {
  const datas = await fetchCivilisationsPosts(world);
  let polygons = [];
  let markers = [];
  let popup, tooltip, icon;
  // console.log(datas);
  for (const one in datas) {
    let data = datas[one];
    // Polygons
    popup =
      '<a href="/rp/civilisation/' +
      data.civid +
      '" class="button is-TD-smoothwhite" style="height: 30px;">' +
      data.name +
      "</a>";
    tooltip = "";
    icon = "udbIcon";
    for (let polygon in data.polygons.villes) {
      let subdata = data.polygons.villes[polygon];
      polygons.push({
        type: subdata.shape,
        dbid: subdata.cartoid,
        option: "civ",
        authorisation: data.authorisation,
        coords: subdata.coords,
        color: subdata.color,
        text: subdata.text,
        icon: subdata.inactif ? yellowIcon : icon,
        popup: popup,
        tooltip: tooltip,
      });
    }
    for (let polygon in data.polygons.quartiers) {
      let subdata = data.polygons.quartiers[polygon];
      polygons.push({
        type: subdata.shape,
        dbid: subdata.cartoid,
        option: "quartier",
        authorisation: data.authorisation,
        coords: subdata.coords,
        color: subdata.color,
        text: subdata.text,
        icon: subdata.inactif ? yellowIcon : icon,
        popup: popup,
        tooltip: tooltip,
      });
    }

    // Villes
    for (let ville in data.villes) {
      let subdata = data.villes[ville];
      popup =
        '<a href="/rp/ville/' +
        subdata.villeid +
        '" class="button is-TD-smoothwhite" style="height: 30px;">' +
        subdata.name +
        "</a>";
      tooltip = '<b class="ultradarkblue">' + subdata.name + "</b>";
      if (subdata.parc == "1") {
        if (subdata.capitale == "1") {
          icon = redIcon;
        } else {
          icon = cyanIcon;
        }
      } else {
        if (subdata.capitale == "1") {
          icon = CapitaleIcon;
        } else {
          icon = CityIcon;
        }
      }
      if (data.inactif == "1") {
        icon = yellowIcon;
      }
      markers.push({
        type: "Markers",
        option: "civ",
        authorisation: data.authorisation,
        coords:
          "[" +
          parseInt(-1 * subdata.coord_z) +
          "," +
          parseInt(subdata.coord_x) +
          "]",
        icon: icon,
        popup: popup,
        tooltip: tooltip,
      });

      // Quartiers
      let q_subdata;
      for (let quartier in subdata.quartiers) {
        q_subdata = subdata.quartiers[quartier];
        tooltip = '<b class="ultradarkblue">' + q_subdata.name + "</b>";
        if (q_subdata.parc == "1") {
          icon = greenIcon;
        } else {
          icon = QuartierIcon;
        }
        if (data.inactif == "1") {
          icon = yellowIcon;
        }
        markers.push({
          type: "Markers",
          option: "quartier",
          authorisation: data.authorisation,
          coords:
            "[" +
            parseInt(-1 * q_subdata.coord_z) +
            "," +
            parseInt(q_subdata.coord_x) +
            "]",
          icon: icon,
          popup: popup,
          tooltip: tooltip,
        });
      }
    }
  }
  const json = { polygons: polygons, markers: markers };
  return json;
}
