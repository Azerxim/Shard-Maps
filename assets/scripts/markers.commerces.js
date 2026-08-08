/**
 * Reconstruit, côté navigateur, la structure jadis produite par
 * assets/api/get/commerces.php à partir de Shard-API (voir shard-api.js).
 *
 * Limites connues par rapport à l'ancien script PHP, faute d'équivalent
 * dans le nouveau modèle de données (Shard-API/api/models.py) :
 *  - `inactif` (civilisation/ville) n'existe plus : toujours considéré actif.
 *  - `parc` (ville/quartier) n'existe plus : toujours considéré à "0".
 * Ajuster ce mapping si ces champs sont réintroduits côté API.
 */

const UI_BASE_URL = window.UI_BASE_URL || "http://localhost";

async function fetchCommercesPosts(world) {
  const [commerces, dimensions, currentUser] = await Promise.all([
    shardApiGet("/commerces/list?limit=1000"),
    shardApiGet("/cartographie/dimensions/read?limit=1000"),
    shardApiCurrentUser(),
  ]);

  const dimension = dimensions.find(
    (d) => (d.link || "").toLowerCase() === String(world).toLowerCase(),
  );
  const dimensionId = dimension ? dimension.id : null;

  // console.log({ commerces: commerces, dimensions: dimensions, currentUser: currentUser, dimension: dimension });

  const posts = {
    commerces: commerces.filter((com) => com.commerce.is_public),
    dimension: dimension,
  };

  return posts;
}

async function MarkersCommerces(world) {
  const datas = await fetchCommercesPosts(world);
  let polygons = [];
  let markers = [];
  let popup, tooltip, icon;
  console.log({ world: world, datas: datas });

  const json = { polygons: polygons, markers: markers };
  return json;
}

async function oldMarkersCommerces(world) {
  const response = await fetch("api/get/commerces.php?data=" + world);
  const res = await response.json();
  const datas = res.posts;
  let polygons = [];
  let markers = [];
  let popup, tooltip;
  console.log(datas);
  for (const one in datas) {
    let data = datas[one];
    // Commerces
    for (let magasin in data.magasins) {
      let subdata = data.magasins[magasin];
      popup =
        '<a href="/rp/commerce/' +
        data.commerceid +
        '" class="button is-TD-smoothwhite" style="height: 30px;">' +
        data.name +
        "</a>";
      tooltip = '<b class="ultradarkblue">' + subdata.name + "</b>";
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
        icon: ShopIcon,
        popup: popup,
        tooltip: tooltip,
      });
    }
  }
  const json = { polygons: polygons, markers: markers };
  return json;
}
