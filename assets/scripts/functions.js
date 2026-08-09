const parsePathName = function () {
  const pathname = window.location.pathname.split("/").pop();
  const args = { data: "tetrago", file: "", option: "" };

  if (pathname) {
    const parts = pathname.split("-");

    for (const part of parts) {
      let key;
      switch (part) {
        case "embed":
        case "embedfull":
        case "editor":
          key = "file";
          break;

        case "civilisations":
        case "commerces":
        case "alliances":
        case "religions":
          key = "option";
          break;

        default:
          key = "data";
          break;
      }
      args[key] = part;
    }
  }
  return args;
};

const parseSearch = function () {
  const args = {};

  if (window.location.search) {
    const parts = window.location.search.substring(1).split("&");

    for (const part of parts) {
      const key_value = part.split("=");
      const key = key_value[0],
        value = key_value.slice(1).join("=");

      args[key] = value;
    }
  }

  return args;
};

const updateMarkerCoords = function (JSONLayers, e) {
  for (let index = 0; index < JSONLayers.length; index++) {
    const element = JSONLayers[index];
    if (element.id == e.layer._leaflet_id) {
      if (e.shape == "Line") {
        element.latlngs = e.layer._latlngs;
      } else if (e.shape == "Polygon" || e.shape == "Rectangle") {
        element.latlngs = e.layer._latlngs[0];
      } else if (e.shape == "Marker") {
        element.x = e.layer._latlng.lng;
        element.z = e.layer._latlng.lat;
      } else if (e.shape == "Text") {
        element.x = e.layer._latlng.lng;
        element.z = e.layer._latlng.lat;
        element.text = e.layer.options.text;
      } else if (e.shape == "Circle") {
        element.x = e.layer._latlng.lng;
        element.z = e.layer._latlng.lat;
        element.radius = e.layer._radius;
      }
    }
    return JSONLayers;
  }
};

function logEvent(e) {
  console.log(e);
}

document.addEventListener("DOMContentLoaded", () => {
  const $button = Array.prototype.slice.call(
    document.querySelectorAll(".button-apparition"),
    0
  );

  if ($button.length > 0) {
    $button.forEach((el) => {
      el.addEventListener("click", () => {
        const target = el.dataset.target;
        const $targets = document.getElementsByClassName(target);

        Array.from($targets).forEach(($target) => {
          if ($target.style.display == "none") {
            $target.style.display = "flex";
          } else {
            $target.style.display = "none";
          }
        });
      });
    });
  }
});
