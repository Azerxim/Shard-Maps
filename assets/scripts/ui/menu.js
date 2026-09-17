async function BuildDate() {
  const response = await fetch("assets/data/maps.json", { cache: "no-store" });
  const maps_data = await response.json();
  console.log(maps_data);
  const maps_date = document.getElementById("maps_date");
  const txt = document.createTextNode(maps_data.date);
  maps_date.appendChild(txt);
}

async function BuildMenu() {
  const pathname = parsePathName();
  const hash = parseHash();
  const maps = await fetch("assets/data/maps.json", { cache: "no-store" });
  const maps_data = await maps.json();
  const maps_menu = document.getElementById("Menu");

  for (var key in maps_data.vanilla) {
    var li = document.createElement("li");
    var a = document.createElement("a");
    var txt = document.createTextNode(key);
    a.appendChild(txt);
    a.href = maps_data.vanilla[key];
    if (pathname.file) {
      a.href += "-" + pathname.file;
    }
    if (pathname.option) {
      a.href += "-" + pathname.option;
    }
    a.className = "justify-end flex-row gap-2 rounded-box rounded-3xl";
    if (maps_data.vanilla[key] == pathname.data) {
      a.className += " bg-primary text-white";
    }

    li.appendChild(a);
    maps_menu.appendChild(li);
  }

  for (var key in maps_data.dimensions) {
    var li = document.createElement("li");
    var a = document.createElement("a");
    var txt = document.createTextNode(key);
    a.appendChild(txt);
    a.href = maps_data.dimensions[key];
    if (pathname.file) {
      a.href += "-" + pathname.file;
    }
    if (pathname.option) {
      a.href += "-" + pathname.option;
    }
    a.className = "justify-end flex-row gap-2 rounded-box rounded-3xl";
    if (maps_data.dimensions[key] == pathname.data) {
      a.className += " bg-primary text-white";
    }

    li.appendChild(a);
    maps_menu.appendChild(li);
  }
}

async function BuildOptions() {
  const pathname = parsePathName();
  const response = await fetch("options.json", { cache: "no-store" });
  const options_data = await response.json();
  const option_div = document.getElementById("OptionsMenu");

  for (var key in options_data["options"]) {
    if (!options_data["options"][key].hidden) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      var i = document.createElement("i");
      var span = document.createElement("span");
      var txt = document.createTextNode(options_data["options"][key].title);
      span.appendChild(txt);

      // <a> classname
      a.className =
        "justify-end flex-row gap-2 rounded-box rounded-3xl " +
        options_data["options"][key].class;
      if (key == pathname.option || key == pathname.file) {
        a.className += " bg-primary text-white";
      }

      // <a> href
      a.href = pathname.data;
      if (key == "embed" || key == "embedfull" || key == "locate" || key == "editor") {
        if (pathname.file != key) {
          a.href += "-" + key;
        }
        if (pathname.option != "") {
          a.href += "-" + pathname.option;
        }
      }
      if (key != "embed" && key != "embedfull" && key != "locate" && key != "editor") {
        if (pathname.file != "") {
          a.href += "-" + pathname.file;
        }

        if (pathname.option != key) {
          a.href += "-" + key;
        }
      }

      a.id = "Option_" + key;

      a.appendChild(span);
      // build button
      if (options_data["options"][key].icon) {
        i.className = options_data["options"][key].icon + " ml-2";
        a.appendChild(i);
      }
      li.appendChild(a);
      option_div.appendChild(li);
    }
  }
}

async function updateOptions() {
  const pathname = parsePathName();
  const hash = parseHash();
  const response = await fetch("options.json", { cache: "no-store" });
  const options_data = await response.json();
  let a;

  if (isNaN(hash.zoom)) hash.zoom = 0;
  if (isNaN(hash.x)) hash.x = 0;
  if (isNaN(hash.z)) hash.z = 0;
  if (isNaN(hash.light)) hash.light = 0;

  for (var key in options_data["options"]) {
    if (!options_data["options"][key].hidden) {
      a = document.getElementById("Option_" + key);
      // Les pages au menu masqué (embedfull, locate) n'appellent pas BuildOptions : l'entrée
      // n'existe pas, il n'y a rien à mettre à jour. Sans ce test, l'exception interrompait
      // la boucle et les entrées suivantes gardaient un lien périmé.
      if (!a) continue;
      // <a> href
      a.href = pathname.data;
      if (key == "embed" || key == "embedfull" || key == "locate" || key == "editor") {
        if (pathname.file != key) {
          a.href += "-" + key;
        }
        if (pathname.option != "") {
          a.href += "-" + pathname.option;
        }
      }
      if (key != "embed" && key != "embedfull" && key != "locate" && key != "editor") {
        if (pathname.file != "") {
          a.href += "-" + pathname.file;
        }

        if (pathname.option != key) {
          a.href += "-" + key;
        }
      }
      a.href += "#x=" + hash.x + "&z=" + hash.z;

      if (hash.zoom != 0) a.href += "&zoom=" + hash.zoom;
      if (hash.light != 0) a.href += "&light=" + hash.light;
    }
  }
}

async function BuildButtons() {
  const response = await fetch("options.json", { cache: "no-store" });
  const options_data = await response.json();
  const option_div = document.getElementById("OptionsButtons");

  for (var key in options_data["buttons"]) {
    if (!options_data["buttons"][key].hidden) {
      var a = document.createElement("a");
      var i = document.createElement("i");
      var span = document.createElement("span");
      var txt = document.createTextNode(options_data["buttons"][key].title);
      span.appendChild(txt);

      // <a> classname
      // a.className = 'menu-button-option button gap-5 is-TD-smoothwhite';
      a.className =
        "btn gap-1 rounded-box rounded-3xl " +
        options_data["buttons"][key].class;

      // <a> href
      a.href = options_data["buttons"][key].href;
      if (options_data["buttons"][key].target != "") {
        a.target = options_data["buttons"][key].target;
      }

      // build button
      if (options_data["buttons"][key].icon) {
        i.className = options_data["buttons"][key].icon;
        a.appendChild(i);
      }
      a.appendChild(span);
      option_div.appendChild(a);
    }
  }
}

function highlightLayerControl() {
  // Sélectionne tous les éléments avec la classe 'leaflet-control-layers'
  const layer = document.querySelector(
    "#map > div.leaflet-control-container > div.leaflet-top.leaflet-right > div"
  );
  layer.className += " bg-base-200";

  const checkbox = document.querySelector(
    "#map > div.leaflet-control-container > div.leaflet-top.leaflet-right > div > section > div.leaflet-control-layers-overlays > label > span > input"
  );
  checkbox.className += " checkbox checkbox-xs";
  const label = document.querySelector(
    "#map > div.leaflet-control-container > div.leaflet-top.leaflet-right > div > section > div.leaflet-control-layers-overlays > label > span"
  );
  label.className += " flex items-center gap-2";
}

function highlightLayerControlEmbed() {
  // Sélectionne tous les éléments avec la classe 'leaflet-control-layers'
  const layer = document.querySelector(
    "#map > div.leaflet-control-container > div.leaflet-top.leaflet-right > div"
  );
  layer.computedStyleMap.display = "none";
}

function highlightLayerControlEditor() {
  // Sélectionne tous les éléments avec la classe 'leaflet-pm-toolbar'
  const layers = document.getElementsByClassName("leaflet-pm-toolbar");

  Array.from(layers).forEach(function (layer) {
    layer.className += " bg-base-200";
  });
}
