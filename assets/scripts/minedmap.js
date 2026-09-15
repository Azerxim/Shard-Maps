// bsearch-based array element check
function contains(array, elem) {
  let min = 0,
    max = array.length;

  while (min < max) {
    const i = min + Math.floor((max - min) / 2);
    const cur = array[i];

    if (cur === elem) return true;
    else if (cur < elem) min = i + 1;
    else max = i;
  }

  return false;
}

const signKinds = {
  sign: {
    iconSize: [26, 28],
    popupAnchor: [0, -20],
  },
  wall_sign: {
    iconSize: [26, 18],
    popupAnchor: [0, -15],
  },
  hanging_sign: {
    iconSize: [28, 24],
    popupAnchor: [0, -18],
  },
  hanging_wall_sign: {
    iconSize: [28, 28],
    popupAnchor: [0, -20],
  },
};

const params = {};
const signIcons = {};
const markers = {};

let updateHash = () => {};

function coordKey(coords) {
  if (!coords) return null;

  return `${coords[0]},${coords[1]}`;
}

function getMarker(coords) {
  return markers[coordKey(coords)];
}

function signIcon(material, kind) {
  function createSignIcon(material, kind) {
    const { iconSize, popupAnchor } = signKinds[kind];

    return L.icon({
      iconUrl: `assets/images/icon/${material}_${kind}.png`,
      iconSize,
      popupAnchor,
      shadowUrl: `assets/images/icon/shadow_${kind}.png`,
      shadowSize: [iconSize[0] + 8, iconSize[1] + 8],
      className: "overzoomed",
    });
  }

  let icons = (signIcons[material] ??= {});
  return (icons[kind] ??= createSignIcon(material, kind));
}

const MinedMapLayer = L.TileLayer.extend({
  initialize: function (mipmaps, layer) {
    L.TileLayer.prototype.initialize.call(this, "", {
      detectRetina: true,
      tileSize: 512,
      zoomReverse: true,
      minZoom: -(mipmaps.length - 1),
      maxZoom: 0,
      attribution: "",
    });

    this.className = "bg-base-100";

    this.options.maxNativeZoom = this.options.maxZoom;
    this.options.maxZoom = undefined;

    this.mipmaps = mipmaps;
    this.layer = layer;
  },

  createTile: function (coords, done) {
    const tile = L.TileLayer.prototype.createTile.call(this, coords, done);

    if (coords.z - this.options.zoomOffset >= 0)
      L.DomUtil.addClass(tile, "overzoomed");
    L.DomUtil.addClass(tile, "bg-base-100");
    return tile;
  },

  getTileUrl: function (coords) {
    const pathname = parsePathName();
    let z = -coords.z + this.options.zoomOffset;
    if (z < 0) z = 0;

    const mipmap = this.mipmaps[z];

    if (
      coords.x < mipmap.bounds.minX ||
      coords.x > mipmap.bounds.maxX ||
      coords.y < mipmap.bounds.minZ ||
      coords.y > mipmap.bounds.maxZ ||
      !contains(mipmap.regions[coords.y] || [], coords.x)
    )
      return L.Util.emptyImageUrl;

    return (
      "assets/data/" +
      pathname.data +
      "/" +
      this.layer +
      "/" +
      z +
      "/r." +
      coords.x +
      "." +
      coords.y +
      ".png"
    );
  },
});

const CoordControl = L.Control.extend({
  initialize: function () {
    this.options.position = "bottomleft";
  },

  onAdd: function (map) {
    this._container = L.DomUtil.create(
      "div",
      "leaflet-control-attribution bg-base-100 dark:text-white"
    );

    return this._container;
  },

  update: function (x, z) {
    if (!this._map) {
      return;
    }

    this._container.innerHTML = "X: " + x + "&nbsp;&nbsp;&nbsp;Z: " + z;
  },
});

const parseHash = function () {
  const args = {};

  if (window.location.hash) {
    const parts = window.location.hash.substring(1).split("&");

    for (const part of parts) {
      const key_value = part.split("=");
      const key = key_value[0],
        value = key_value.slice(1).join("=");

      args[key] = value;
    }
  }

  return args;
};

const colors = {
  black: "#000000",
  dark_blue: "#0000AA",
  dark_green: "#00AA00",
  dark_aqua: "#00AAAA",
  dark_red: "#AA0000",
  dark_purple: "#AA00AA",
  gold: "#FFAA00",
  gray: "#AAAAAA",
  dark_gray: "#555555",
  blue: "#5555FF",
  green: "#55FF55",
  aqua: "#55FFFF",
  red: "#FF5555",
  light_purple: "#FF55FF",
  yellow: "#FFFF55",
  white: "#FFFFFF",
};

function formatSignLine(line) {
  const el = document.createElement("span");
  el.style.whiteSpace = "pre";

  for (const span of line) {
    const child = document.createElement("span");
    child.textContent = span.text;

    const color = colors[span.color ?? "black"] || colors["black"];

    if (span.bold) child.style.fontWeight = "bold";
    if (span.italic) child.style.fontStyle = "italic";

    child.style.textDecoration = "";
    if (span.underlined) child.style.textDecoration += " underline";
    if (span.strikethrough) child.style.textDecoration += " line-through";

    child.style.color = color;
    if (span.obfuscated) {
      child.style.backgroundColor = color;
      child.className = "obfuscated";
    }

    el.appendChild(child);
  }
  return el;
}

function createSign(sign, back) {
  // standing signs
  function px(base) {
    const scale = 11;
    return base * scale + "px";
  }
  // hanging signs
  function pxh(base) {
    const scale = 16;
    return base * scale + "px";
  }

  const sizes = {
    sign: {
      width: px(24),
      height: px(12),
      paddingTop: px(0),
      paddingBottom: px(14),
    },
    wall_sign: {
      width: px(24),
      height: px(12),
      paddingTop: px(0),
      paddingBottom: px(0),
    },
    hanging_sign: {
      width: pxh(16),
      height: pxh(10),
      paddingTop: pxh(4),
      paddingBottom: pxh(0),
    },
    hanging_wall_sign: {
      width: pxh(16),
      height: pxh(10),
      paddingTop: pxh(6),
      paddingBottom: pxh(0),
    },
  };
  const size = sizes[sign.kind];

  const wrapper = document.createElement("div");
  wrapper.classList = "sign-wrapper";

  const title = document.createElement("div");
  title.classList = "sign-title";
  title.textContent = `Sign at ${sign.x}/${sign.y}/${sign.z}`;
  if (back) title.textContent += " (back)";
  title.textContent += ":";

  wrapper.appendChild(title);

  const container = document.createElement("div");
  container.style.width = size.width;
  container.style.height = size.height;
  container.style.paddingTop = size.paddingTop;
  container.style.paddingBottom = size.paddingBottom;
  container.style.backgroundImage = `url(assets/images/bg/${sign.material}_${sign.kind}.png)`;
  container.classList = "sign-container overzoomed";

  const content = document.createElement("div");
  content.classList = "sign-content";

  let text = [];
  if (!back && sign.front_text) text = sign.front_text;
  else if (back && sign.back_text) text = sign.back_text;

  for (const line of text) {
    content.appendChild(formatSignLine(line));
    content.appendChild(document.createElement("br"));
  }

  container.appendChild(content);
  wrapper.appendChild(container);

  return wrapper;
}

async function loadSigns(signLayer) {
  const pathname = parsePathName();
  const response = await fetch(
    "assets/data/" + pathname.data + "/entities.json",
    { cache: "no-store" }
  );
  const res = await response.json();

  const groups = {};

  // Group signs by x,z coordinates
  for (const sign of res.signs) {
    const key = coordKey([sign.x, sign.z]);
    const group = (groups[key] ??= []);
    group.push(sign);
  }

  for (const [key, group] of Object.entries(groups)) {
    const el = document.createElement("div");

    let material;
    let kind;

    // Sort from top to bottom
    group.sort((a, b) => b.y - a.y);

    for (const sign of group) {
      el.appendChild(createSign(sign, false));

      if (sign.back_text) el.appendChild(createSign(sign, true));

      material ??= sign.material;
      kind ??= sign.kind;
    }

    // Default material
    material ??= "oak";

    const [x, z] = key.split(",").map((i) => +i);

    const popup = L.popup().setContent(el);

    popup.on("add", () => {
      params.marker = [x, z];
      updateHash();
    });
    popup.on("remove", () => {
      params.marker = null;
      updateHash();
    });

    const marker = L.marker([-z - 0.5, x + 0.5], {
      icon: signIcon(material, kind),
    })
      .addTo(signLayer)
      .bindPopup(popup);

    markers[coordKey([x, z])] = marker;

    if (params.marker && x === params.marker[0] && z === params.marker[1])
      marker.openPopup();
  }
}

window.createMap = function () {
  (async function () {
    const pathname = parsePathName();
    const response = await fetch(
      "assets/data/" + pathname.data + "/info.json",
      { cache: "no-store" }
    );
    const res = await response.json();
    const { mipmaps, spawn } = res;
    const features = res.features || {};

    const updateParams = function () {
      const args = parseHash();

      params.zoom = parseInt(args["zoom"]);
      params.x = parseFloat(args["x"]);
      params.z = parseFloat(args["z"]);
      params.light = parseInt(args["light"]);
      params.signs = parseInt(args["signs"] ?? "1");
      params.marker = (args["marker"] ?? "").split(",").map((i) => +i);

      if (isNaN(params.zoom)) params.zoom = 0;
      if (isNaN(params.x)) params.x = spawn.x;
      if (isNaN(params.z)) params.z = spawn.z;
      if (!features.signs || isNaN(params.marker[0]) || isNaN(params.marker[1]))
        params.marker = null;
    };

    updateParams();

    const map = L.map("map", {
      center: [-params.z, params.x],
      zoom: params.zoom,
      minZoom: -(mipmaps.length - 1),
      maxZoom: 5,
      crs: L.CRS.Simple,
      maxBounds: [
        [-512 * (mipmaps[0].bounds.maxZ + 1), 512 * mipmaps[0].bounds.minX],
        [-512 * mipmaps[0].bounds.minZ, 512 * (mipmaps[0].bounds.maxX + 1)],
      ],
    });

    const overlayMaps = {};

    const mapLayer = new MinedMapLayer(mipmaps, "map");
    mapLayer.addTo(map);

    const lightLayer = new MinedMapLayer(mipmaps, "light");
    overlayMaps["Illumination"] = lightLayer;
    if (params.light) map.addLayer(lightLayer);

    let signLayer;
    if (features.signs) {
      signLayer = L.layerGroup();
      loadSigns(signLayer);
      if (params.signs) map.addLayer(signLayer);

      overlayMaps["Signs"] = signLayer;
    }

    L.control.layers({}, overlayMaps).addTo(map);

    const coordControl = new CoordControl();
    coordControl.addTo(map);

    // Spawn
    if (pathname.data != "endrya") {
      L.marker([-spawn.z, spawn.x], { icon: SpawnIcon })
        .addTo(map) // [-z, x]
        .bindTooltip('<b class="">Spawn</b>', { className: "bg-base-100" });
    } else {
      L.marker([0, 0], { icon: SpawnIcon })
        .addTo(map) // [-z, x]
        .bindTooltip('<b class="">Spawn</b>', { className: "bg-base-100" });
    }

    let json, subdata;
    switch (pathname.option) {
      case "civilisations":
        json = await MarkersCivilisations(pathname.data);
        break;

      case "commerces":
        json = await MarkersCommerces(pathname.data);
        break;

      case "alliances":
        // json = await MarkersAlliances(pathname.data);
        break;

      case "religions":
        json = await MarkersReligions(pathname.data);
        break;

      case "guerres":
        json = await MarkersGuerres(pathname.data);
        break;
    }

    // console.log('json:', json);

    highlightLayerControl();

    if (json) {
      for (let one in json.polygons) {
        subdata = json.polygons[one];
        switch (subdata.type) {
          case "Circle":
            L.circle(JSON.parse(subdata.coords)[0], {
              color: subdata.color,
              fillColor: subdata.color,
              fillOpacity: 0.2,
              radius: JSON.parse(subdata.coords)[1],
            })
              .addTo(map)
              .bindPopup(subdata.popup, { className: "customPopup" });
            break;

          case "Rectangle":
          case "Polygon":
          case "Line":
            L.polygon(JSON.parse(subdata.coords), { color: subdata.color })
              .addTo(map)
              .bindPopup(subdata.popup, { className: "customPopup" });
            break;

          case "Markers":
            L.marker(JSON.parse(subdata.coords), { icon: subdata.icon })
              .addTo(map) // [-z, x]
              .bindTooltip("", { className: "bg-base-100" })
              .bindPopup(subdata.popup, { className: "customPopup" });
            break;

          case "Text":
            CartographieTextMarker(JSON.parse(subdata.coords), subdata.text, subdata.color)
              .addTo(map) // [-z, x]
              .bindPopup(subdata.popup, { className: "customPopup" });
            break;
        }
      }

      for (let one in json.markers) {
        subdata = json.markers[one];
        switch (subdata.type) {
          case "Markers":
            L.marker(JSON.parse(subdata.coords), { icon: subdata.icon })
              .addTo(map) // [-z, x]
              .bindTooltip(subdata.tooltip, { className: "bg-base-100" })
              .bindPopup(subdata.popup, { className: "customPopup" });
            break;
        }
      }
    }

    map.on("mousemove", function (e) {
      coordControl.update(Math.round(e.latlng.lng), Math.round(-e.latlng.lat));
    });

    const makeHash = function () {
      let ret = "#x=" + params.x + "&z=" + params.z;

      if (params.zoom != 0) ret += "&zoom=" + params.zoom;

      if (map.hasLayer(lightLayer)) ret += "&light=1";
      if (features.signs && !map.hasLayer(signLayer)) ret += "&signs=0";
      if (params.marker) {
        ret += `&marker=${params.marker[0]},${params.marker[1]}`;
      }

      return ret;
    };

    updateHash = function () {
      window.location.hash = makeHash();
      updateOptions();
    };

    const refreshHash = function (ev) {
      if (ev.type === "layeradd" || ev.type === "layerremove") {
        if (ev.layer !== lightLayer && ev.layer !== signLayer) return;
      }

      const center = map.getCenter();

      params.zoom = map.getZoom();
      params.x = Math.round(center.lng);
      params.z = Math.round(-center.lat);

      updateHash();
    };

    updateHash();

    map.on("moveend", refreshHash);
    map.on("zoomend", refreshHash);
    map.on("layeradd", refreshHash);
    map.on("layerremove", refreshHash);

    window.onhashchange = function () {
      if (window.location.hash === makeHash()) return;

      const prevMarkerCoords = params.marker;

      updateParams();

      if (params.light) map.addLayer(lightLayer);
      else map.removeLayer(lightLayer);

      if (features.signs) {
        if (params.signs) map.addLayer(signLayer);
        else map.removeLayer(signLayer);

        if (coordKey(prevMarkerCoords) !== coordKey(params.marker))
          getMarker(params.marker)?.openPopup();
      }

      map.setView([-params.z, params.x], params.zoom);

      updateHash();
    };
  })();
};
