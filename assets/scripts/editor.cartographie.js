/**
 * Éditeur de cartographie branché sur Shard-API (routes /cartographie/*).
 *
 * L'entité éditée est passée dans la query string :
 *  - {dimension}-editor-civilisations?civilisation=ID : marqueurs de la civilisation
 *  - {dimension}-editor-civilisations?ville=ID        : frontières de la ville
 *  - {dimension}-editor-civilisations?quartier=ID     : frontières du quartier
 *  - {dimension}-editor-civilisations?guerre=ID       : zones de conflit d'une guerre en cours
 *
 * Les autres civilisations / villes sont affichées en lecture seule pour le
 * contexte. Les modifications restent locales jusqu'au clic sur "Save".
 * Coordonnées stockées au format Leaflet ([-z, x]), comme les données existantes.
 */

const CARTOGRAPHIE_EDITOR_MODES = {
  civilisation: {
    label: "Marqueurs",
    shapes: ["Marker", "Text"],
    defaultColor: CartographieMarkerDefaultColor,
  },
  ville: {
    label: "Frontières",
    shapes: ["Polygon", "Rectangle"],
    defaultColor: "#3388ff",
  },
  quartier: {
    label: "Frontières du quartier",
    shapes: ["Polygon", "Rectangle"],
    defaultColor: "#f59e0b",
  },
  guerre: {
    label: "Zones de conflit",
    shapes: ["Polygon", "Rectangle", "Marker"],
    defaultColor: "#dc2626",
  },
};

let cartographieEditor = null;

function roundCartographieCoord(value) {
  return Math.round(value * 2) / 2;
}

function isPointShape(shape) {
  return shape === "Marker" || shape === "Text";
}

function cartographieDefaultColor(shape) {
  return shape === "Text" ? CartographieTextDefaultColor : cartographieEditor.mode.defaultColor;
}

function applyCartographieColor(layer, entry) {
  if (entry.shape === "Marker") layer.setIcon(CartographieMarkerIcon(entry.color));
  else if (entry.shape === "Text") layer.pm.getElement().style.color = CartographieTextColor(entry.color);
  else layer.setStyle({ color: entry.color, fillColor: entry.color });
}

function cartographieCoordinates(layer, shape) {
  if (isPointShape(shape)) {
    const latlng = layer.getLatLng();
    return JSON.stringify([
      roundCartographieCoord(latlng.lat),
      roundCartographieCoord(latlng.lng),
    ]);
  }
  return JSON.stringify(
    layer
      .getLatLngs()[0]
      .map((latlng) => [
        roundCartographieCoord(latlng.lat),
        roundCartographieCoord(latlng.lng),
      ]),
  );
}

function setEditorInfo(text, className = "") {
  const info = document.getElementById("EditorInfo");
  if (!info) return;
  info.textContent = text;
  info.className = "badge badge-lg h-auto py-2 rounded-3xl " + className;
}

async function loadCartographieEditorEntity(pathname) {
  const search = parseSearch();
  const type = ["civilisation", "ville", "quartier", "guerre"].find((key) => search[key]);
  if (!type) return null;

  const typeId = parseInt(search[type]);
  const dimensions = await shardApiGet("/cartographie/dimensions/read?limit=1000");
  const dimension = dimensions.find(
    (d) => (d.link || "").toLowerCase() === String(pathname.data).toLowerCase(),
  );
  if (!dimension) throw new Error(`Dimension "${pathname.data}" inconnue de Shard-API`);

  let entity;
  if (type === "civilisation") {
    entity = (await shardApiGet(`/civilisations/read/${typeId}`)).civilisation;
  } else if (type === "guerre") {
    // Guerre publique uniquement : les zones se tracent une fois la guerre validée
    entity = (await shardApiGet(`/guerres/read/${typeId}`)).guerre;
  } else if (type === "quartier") {
    // Le quartier n'a pas de dimension propre : c'est celle de sa ville
    const infos = await shardApiGet(`/civilisations/quartiers/read/${typeId}`);
    entity = infos.quartier ? { ...infos.quartier, ville: infos.ville } : null;
  } else {
    entity = (await shardApiGet(`/civilisations/villes/id/${typeId}`)).ville;
  }
  if (!entity) throw new Error(`${type} ${typeId} introuvable`);

  const cartographies = (
    await shardApiGet(`/cartographie/entity/${type}/${typeId}`)
  ).filter((carto) => carto.dimension_id === dimension.id);

  return { type, typeId, entity, dimension, cartographies };
}

// Formulaire de propriétés affiché dans la popup d'une couche éditable
function buildCartographieForm(layer, entry) {
  const form = document.createElement("div");
  form.className = "flex flex-col gap-2";
  L.DomEvent.disableClickPropagation(form);
  L.DomEvent.disableScrollPropagation(form);

  const addField = (label, element, property, onChange) => {
    const wrapper = document.createElement("label");
    wrapper.className = "flex flex-col gap-1";
    const span = document.createElement("span");
    span.textContent = label;
    element.value = entry[property] ?? "";
    element.addEventListener("input", () => {
      entry[property] = element.value;
      entry.dirty = true;
      onChange?.(element.value);
    });
    wrapper.append(span, element);
    form.appendChild(wrapper);
  };

  if (entry.shape === "Text") {
    const text = document.createElement("textarea");
    text.className = "textarea textarea-sm";
    // setText déclenche pm:textchange, qui met à jour entry.text
    addField("Texte", text, "text", (value) => layer.pm.setText(value));
  } else {
    const title = document.createElement("input");
    title.type = "text";
    title.className = "input input-sm";
    title.placeholder = cartographieEditor.entity.title;
    addField("Titre", title, "title");

    const description = document.createElement("textarea");
    description.className = "textarea textarea-sm";
    addField("Description", description, "description");
  }

  const color = document.createElement("input");
  color.type = "color";
  color.className = "w-full h-8 cursor-pointer";
  addField("Couleur", color, "color", () => applyCartographieColor(layer, entry));

  // Suppression locale, appliquée à l'API au clic sur "Save" (comme la gomme de geoman)
  const labels = { Marker: "le marqueur", Text: "le texte" };
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "btn btn-sm btn-error rounded-3xl";
  remove.textContent = `Supprimer ${labels[entry.shape] || "la frontière"}`;
  remove.addEventListener("click", () => {
    entry.deleted = true;
    layer.closePopup();
    layer.remove();
  });
  form.appendChild(remove);

  return form;
}

function registerCartographieLayer(layer, shape, data) {
  const entry = {
    dbid: data.id ?? null,
    shape,
    title: data.title ?? "",
    description: data.description ?? "",
    text: data.text ?? "",
    color: data.color || cartographieDefaultColor(shape),
    dirty: data.id == null,
    deleted: false,
  };
  cartographieEditor.layers.set(layer, entry);
  applyCartographieColor(layer, entry);

  layer.on("pm:edit pm:dragend", () => {
    entry.dirty = true;
  });

  if (shape === "Text") {
    layer.on("pm:textchange", (e) => {
      if (entry.text === e.text) return;
      entry.text = e.text;
      entry.dirty = true;
    });
    // Pas de popup pendant la saisie directe du texte sur la carte
    layer.on("popupopen", () => {
      if (layer.pm.enabled()) layer.closePopup();
    });
  } else {
    layer.bindTooltip(() => escapeHtml(entry.title || cartographieEditor.entity.title), {
      className: "bg-base-100",
    });
  }
  layer.bindPopup(() => buildCartographieForm(layer, entry), {
    className: "customPopup",
    minWidth: 220,
  });
  return entry;
}

function renderCartographieContext(map, json, excludedIds) {
  if (!json) return;

  for (const subdata of json.polygons) {
    if (excludedIds.has(subdata.dbid)) continue;
    const coords = JSON.parse(subdata.coords);
    const layer =
      subdata.type === "Text"
        ? CartographieTextMarker(coords, subdata.text, subdata.color, { pmIgnore: true })
        : L.polygon(coords, { color: subdata.color, pmIgnore: true });
    layer.addTo(map).bindPopup(subdata.popup, { className: "customPopup" });
  }

  for (const subdata of json.markers) {
    if (excludedIds.has(subdata.dbid)) continue;
    L.marker(JSON.parse(subdata.coords), { icon: subdata.icon, pmIgnore: true })
      .addTo(map) // [-z, x]
      .bindTooltip(subdata.tooltip, { className: "bg-base-100" })
      .bindPopup(subdata.popup, { className: "customPopup" });
  }
}

function initCartographieEditor(map, pathname) {
  // Afficher l'erreur plutôt que de laisser l'éditeur bloqué sur "Chargement..."
  return setupCartographieEditor(map, pathname).catch((error) => {
    console.error(error);
    setEditorInfo("Erreur de l'éditeur : " + error.message, "badge-error");
  });
}

async function setupCartographieEditor(map, pathname) {
  // Centrer sur l'entité uniquement si l'URL ne fixe pas déjà la position
  const hasPosition = "x" in parseHash();

  let data;
  try {
    data = await loadCartographieEditorEntity(pathname);
  } catch (error) {
    console.error(error);
    setEditorInfo(error.message, "badge-error");
    return;
  }

  const context = await MarkersCivilisations(pathname.data).catch((error) => {
    console.error(error);
    return null;
  });

  if (!data) {
    renderCartographieContext(map, context, new Set());
    setEditorInfo("Aucune civilisation, ville, quartier ou guerre sélectionné", "badge-warning");
    return;
  }

  const mode = CARTOGRAPHIE_EDITOR_MODES[data.type];
  cartographieEditor = { ...data, mode, layers: new Map() };

  renderCartographieContext(
    map,
    context,
    new Set(data.cartographies.map((carto) => carto.id)),
  );

  const editableLayer = L.featureGroup().addTo(map);
  for (const carto of data.cartographies) {
    const coords = JSON.parse(carto.coordinates);
    const color = carto.color || mode.defaultColor;
    let layer;
    if (carto.shape_type === "Marker") {
      layer = L.marker(coords, { icon: CartographieMarkerIcon(color), pmIgnore: false });
    } else if (carto.shape_type === "Text") {
      layer = L.marker(coords, { textMarker: true, text: carto.text || "", pmIgnore: false });
    } else {
      layer = L.polygon(coords, { color, pmIgnore: false });
    }
    layer.addTo(editableLayer);
    registerCartographieLayer(layer, carto.shape_type, carto);
  }

  map.pm.setLang("fr");
  map.pm.addControls({
    position: "topleft",
    drawMarker: mode.shapes.includes("Marker"),
    drawPolygon: mode.shapes.includes("Polygon"),
    drawRectangle: mode.shapes.includes("Rectangle"),
    drawPolyline: false,
    drawCircle: false,
    drawCircleMarker: false,
    drawText: mode.shapes.includes("Text"),
    cutPolygon: false,
    rotateMode: false,
    editMode: true,
    dragMode: true,
    removalMode: true,
  });
  map.pm.setGlobalOptions({
    layerGroup: editableLayer,
    markerStyle: { icon: CartographieMarkerIcon(mode.defaultColor) },
    pathOptions: { color: mode.defaultColor },
  });
  highlightLayerControlEditor();

  map.on("pm:create", (e) => {
    // Mode opt-in (voir editor.minedmap.js) : rendre la nouvelle couche éditable
    e.layer.options.pmIgnore = false;
    L.PM.reInitLayer(e.layer);
    registerCartographieLayer(e.layer, e.shape, {
      // Frontière de ville ou de quartier : titrée d'après l'entité
      title: data.type !== "civilisation" ? data.entity.title : "",
    });
    if (e.shape === "Text") {
      // En opt-in, geoman n'a pas pu activer la saisie au moment du dessin
      e.layer.pm.enable();
      e.layer.pm.focus();
      e.layer.pm._disableOnBlur();
    } else {
      e.layer.openPopup();
    }
  });

  map.on("pm:remove", (e) => {
    const entry = cartographieEditor.layers.get(e.layer);
    if (entry) entry.deleted = true;
  });

  window.addEventListener("beforeunload", (event) => {
    if (hasPendingCartographieChanges()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  setEditorInfo(`${mode.label} : ${data.entity.title}`, "badge-primary");

  if (!hasPosition) {
    const target = data.cartographies[0]
      ? JSON.parse(data.cartographies[0].coordinates)
      : null;
    if (data.type !== "civilisation" && data.entity.x != null) {
      map.setView([-data.entity.z, data.entity.x], map.getZoom());
    } else if (target) {
      map.setView(Array.isArray(target[0]) ? target[0] : target, map.getZoom());
    }
  }

  if (!(await shardApiToken())) {
    setEditorInfo(
      "Non connecté : " + (shardApiAuthError() || "ouvrez l'éditeur depuis le site Tetrago pour sauvegarder"),
      "badge-warning",
    );
  }
}

function hasPendingCartographieChanges() {
  if (!cartographieEditor) return false;
  for (const entry of cartographieEditor.layers.values()) {
    if (entry.deleted ? entry.dbid : entry.dirty) return true;
  }
  return false;
}

async function saveCartographie() {
  if (!cartographieEditor) return;
  const { type, typeId, dimension, layers } = cartographieEditor;
  const errors = [];
  let count = 0;

  // Séquentiel : l'état local est mis à jour après chaque succès, un nouvel
  // essai après une erreur ne recrée donc pas de doublons.
  for (const [layer, entry] of layers) {
    try {
      // Un texte vidé équivaut à une suppression
      if (entry.shape === "Text" && !entry.deleted && !entry.text.trim()) {
        entry.deleted = true;
        layer.remove();
      }
      if (entry.deleted) {
        if (entry.dbid) {
          await shardApiRequest("DELETE", `/cartographie/delete/${entry.dbid}`);
          count++;
        }
        layers.delete(layer);
        continue;
      }
      if (!entry.dirty) continue;

      const body = {
        title: entry.title,
        description: entry.description,
        text: entry.shape === "Text" ? entry.text : null,
        color: entry.color,
        shape_type: entry.shape,
        coordinates: cartographieCoordinates(layer, entry.shape),
      };
      if (entry.dbid) {
        await shardApiRequest("PUT", `/cartographie/update/${entry.dbid}`, body);
      } else {
        const res = await shardApiRequest("POST", "/cartographie/create", {
          ...body,
          type,
          type_id: typeId,
          dimension_id: dimension.id,
        });
        entry.dbid = res.cartographie.id;
      }
      entry.dirty = false;
      count++;
    } catch (error) {
      console.error(error);
      errors.push(`${entry.title || entry.shape} : ${error.message}`);
    }
  }

  if (errors.length) {
    swal({
      title: "Oops...",
      text: errors.join("\n"),
      type: "error",
      confirmButtonColor: "#d32300",
      confirmButtonText: "Ok",
    });
  } else {
    // La connexion a pu être rétablie entre-temps : le badge « Non connecté » n'a plus lieu d'être
    setEditorInfo(`${cartographieEditor.mode.label} : ${cartographieEditor.entity.title}`, "badge-primary");
    swal({
      title: "",
      text: count ? "Modifications enregistrées" : "Aucune modification à enregistrer",
      type: "success",
      confirmButtonColor: "#2E3144",
      confirmButtonText: "Ok",
    });
  }
}

function CancelButton() {
  swal(
    {
      title: "Annulation",
      text: "Êtes vous sur de vouloir annuler les modifications non enregistrées ?",
      type: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d32300",
      confirmButtonText: "Oui",
      cancelButtonText: "Non",
      closeOnConfirm: true,
    },
    function () {
      cartographieEditor = null; // pas d'alerte beforeunload
      location.reload();
    },
  );
}

// Page ShardUI-2 de l'entité éditée
function cartographieEditorBackUrl() {
  const base = String(window.UI_BASE_URL || "").replace(/\/$/, "");
  if (!cartographieEditor) return base || "/";
  const { type, typeId, entity } = cartographieEditor;
  if (type === "guerre") return `${base}/guerre/${typeId}`;
  if (type === "quartier") return `${base}/quartier/${typeId}`;
  if (type === "ville") return `${base}/civilisation/${entity.civilisation_id}/ville/${typeId}`;
  return `${base}/civilisation/${typeId}`;
}

function BackButton() {
  const leave = () => {
    const url = cartographieEditorBackUrl();
    cartographieEditor = null; // pas d'alerte beforeunload
    // Ouvert depuis ShardUI-2 (window.open) : la page d'origine est restée ouverte
    if (window.opener && !window.opener.closed) {
      window.close();
      if (window.closed) return;
    }
    window.location.href = url;
  };

  if (!hasPendingCartographieChanges()) {
    leave();
    return;
  }
  swal(
    {
      title: "Retour",
      text: "Des modifications ne sont pas enregistrées. Quitter l'éditeur quand même ?",
      type: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d32300",
      confirmButtonText: "Quitter",
      cancelButtonText: "Rester",
      closeOnConfirm: true,
    },
    leave,
  );
}
