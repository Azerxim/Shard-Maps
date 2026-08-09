/**
 * Reconstruit, côté navigateur, la structure jadis produite par
 * assets/api/get/civilisations.php à partir de Shard-API (voir shard-api.js).
 *
 * Limites connues par rapport à l'ancien script PHP, faute d'équivalent
 * dans le nouveau modèle de données (Shard-API/api/models.py) :
 *  - `inactif` (civilisation/ville) n'existe plus : toujours considéré actif.
 *  - `parc` (ville/quartier) n'existe plus : toujours considéré à "0".
 * Ajuster ce mapping si ces champs sont réintroduits côté API.
 */

const UI_BASE_URL = window.UI_BASE_URL || "http://localhost";

async function fetchCivilisationsPosts(world) {
  const [civilisations, cartographies, dimensions, currentUser] =
    await Promise.all([
      shardApiGet("/civilisations/list?limit=1000"),
      shardApiGet("/cartographie/list?limit=1000"),
      shardApiGet("/cartographie/dimensions/read?limit=1000"),
      shardApiCurrentUser(),
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
    // Polygons
    popup = `<a href="${UI_BASE_URL}/civilisation/${civilisation.id}" class="btn btn-primary btn-sm" style="">${civilisation.title}</a>`;
    tooltip = "";
    icon = "udbIcon";

    // Polygon data
    civ_carto.forEach((polygon) => {
      popup = `
          <div class="flex flex-col gap-2">
            <div class="flex flex-row gap-2">
              <span>Ville:</span>
              <span>${polygon.title}</span>
            </div>
            <div class="flex flex-row gap-2">
              <span>Description:</span>
              <span>${polygon.description}</span>
            </div>
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

    // Villes
    for (let ville in villes) {
      let subdata = villes[ville];
      popup = `
      <div class="flex flex-col gap-2">
        <div class="flex flex-row gap-2">
          <span>Civilisation:</span>
          <span>${civilisation.title}</span>
        </div>
        <div class="flex flex-row gap-2">
          <span>Ville:</span>
          <span>${subdata.title}</span>
        </div>
        <a href="${UI_BASE_URL}/ville/${subdata.id}" class="btn btn-secondary btn-sm" style="color: white;">Voir la ville</a>
        <a href="${UI_BASE_URL}/civilisation/${civilisation.id}" class="btn btn-secondary btn-sm" style="color: white;">Voir la civilisation</a>
      </div>`;
      tooltip = `<b class="">${civilisation.title} - ${subdata.title}</b>`;
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

      // Polygons Ville
      let ville_carto = datas.cartographies.filter(
        (carto) => carto.type_id === subdata.id && carto.type === "ville",
      );
      ville_carto.forEach((polygon) => {
        popup = `
          <div class="flex flex-col gap-2">
            <div class="flex flex-row gap-2">
              <span>Ville:</span>
              <span>${polygon.title}</span>
            </div>
            <div class="flex flex-row gap-2">
              <span>Description:</span>
              <span>${polygon.description}</span>
            </div>
            <a href="${UI_BASE_URL}/ville/${subdata.id}" class="btn btn-secondary btn-sm" style="color: white;">Voir la ville</a>
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
