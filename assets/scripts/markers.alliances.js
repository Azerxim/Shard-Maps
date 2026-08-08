/**
 * Reconstruit, côté navigateur, la structure jadis produite par
 * assets/api/get/alliances.php à partir de Shard-API (voir shard-api.js).
 *
 * Limites connues par rapport à l'ancien script PHP, faute d'équivalent
 * dans le nouveau modèle de données (Shard-API/api/models.py) :
 *  - `inactif` (civilisation/ville) n'existe plus : toujours considéré actif.
 *  - `parc` (ville/quartier) n'existe plus : toujours considéré à "0".
 * Ajuster ce mapping si ces champs sont réintroduits côté API.
 */

const UI_BASE_URL = window.UI_BASE_URL || "http://localhost";

async function fetchAlliancesPosts(world) {
  const [alliances, dimensions, currentUser] = await Promise.all([
    shardApiGet("/alliances/list?limit=1000"),
    shardApiGet("/cartographie/dimensions/read?limit=1000"),
    shardApiCurrentUser(),
  ]);

  const dimension = dimensions.find(
    (d) => (d.link || "").toLowerCase() === String(world).toLowerCase(),
  );
  const dimensionId = dimension ? dimension.id : null;

  // console.log({ alliances: alliances, dimensions: dimensions, currentUser: currentUser, dimension: dimension });

  const posts = {
    alliances: alliances.filter((all) => all.alliance.is_public),
    dimension: dimension,
  };

  return posts;
}

async function MarkersAlliances(world) {
  const datas = await fetchAlliancesPosts(world);
  let polygons = [];
  let markers = [];
  let popup, tooltip, icon;
  console.log({ world: world, datas: datas });

  const json = { polygons: polygons, markers: markers };
  return json;
}

async function oldMarkersAlliances(world) {
  const response = await fetch("api/get/alliances.php?data=" + world);
  const res = await response.json();
  const datas = res.posts;
  let polygons = [];
  let markers = [];
  let popup, tooltip;
  console.log(datas);
  for (const one in datas) {
    let data = datas[one];
    // Polygons
    if (data.alliance.id == 0) {
      popup =
        '<a href="/rp/civilisation/' +
        data.civid +
        '" class="button is-TD-smoothwhite" style="height: 30px;">' +
        data.name +
        "</a>";
    } else {
      popup =
        '<a href="/rp/civilisation/' +
        data.alliance.id +
        '" class="button is-TD-smoothwhite" style="height: 30px;">' +
        data.alliance.name +
        "</a>";
    }
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
        color: data.alliance.color,
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
        color: data.alliance.color,
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
