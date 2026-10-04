var udbIcon = L.IconMaterial.icon({
  icon: "",
  iconColor: "#fff",
  markerColor: "#17131f",
  outlineColor: "white",
  outlineWidth: 0.5,
  iconSize: [31, 42],
});
var redIcon = L.IconMaterial.icon({
  icon: "",
  iconColor: "#fff",
  markerColor: "#b3263a",
  outlineColor: "white",
  outlineWidth: 0.5,
  iconSize: [31, 42],
});
var blueIcon = L.IconMaterial.icon({
  icon: "",
  iconColor: "#fff",
  markerColor: "#2e4fb0",
  outlineColor: "white",
  outlineWidth: 0.5,
  iconSize: [31, 42],
});
var cyanIcon = L.IconMaterial.icon({
  icon: "",
  iconColor: "#fff",
  markerColor: "#169c9c",
  outlineColor: "white",
  outlineWidth: 0.5,
  iconSize: [31, 42],
});
var upIcon = L.IconMaterial.icon({
  icon: "",
  iconColor: "#fff",
  markerColor: "#8932b8",
  outlineColor: "white",
  outlineWidth: 0.5,
  iconSize: [31, 42],
});
var yellowIcon = L.IconMaterial.icon({
  icon: "",
  iconColor: "#fff",
  markerColor: "#e3a82b",
  outlineColor: "white",
  outlineWidth: 0.5,
  iconSize: [31, 42],
});
var greenIcon = L.IconMaterial.icon({
  icon: "",
  iconColor: "#fff",
  markerColor: "#1f7a55",
  outlineColor: "white",
  outlineWidth: 0.5,
  iconSize: [31, 42],
});

var SpawnIcon = L.IconMaterial.icon({
  icon: "home",
  iconColor: "#fff",
  markerColor: "#17131f",
  outlineColor: "white",
  outlineWidth: 0.5,
  iconSize: [31, 42],
});
var CapitaleIcon = L.AwesomeMarkers.icon({
  prefix: "fa",
  icon: "archway",
  iconColor: "#fff",
  markerColor: "red",
});
var CityIcon = L.AwesomeMarkers.icon({
  prefix: "fa",
  icon: "city",
  iconColor: "#fff",
  markerColor: "blue",
});
var QuartierIcon = L.AwesomeMarkers.icon({
  prefix: "fa",
  icon: "house-flag",
  iconColor: "#fff",
  markerColor: "green",
});
// Marqueurs de cartographie des civilisations (couleur choisie dans l'éditeur)
var CartographieMarkerDefaultColor = "#8932b8";
function CartographieMarkerIcon(color) {
  return L.IconMaterial.icon({
    icon: "flag",
    iconColor: "#fff",
    markerColor: color || CartographieMarkerDefaultColor,
    outlineColor: "white",
    outlineWidth: 0.5,
    iconSize: [31, 42],
  });
}
// Bâtiment destructible (cartographie "destructible", vue Guerres) : une flamme plutôt que le drapeau
var DestructibleDefaultColor = "#c98a12";
function DestructibleMarkerIcon(color) {
  return L.IconMaterial.icon({
    icon: "local_fire_department",
    iconColor: "#fff",
    markerColor: color || DestructibleDefaultColor,
    outlineColor: "white",
    outlineWidth: 0.5,
    iconSize: [31, 42],
  });
}
// Zone commerciale (vue Commerces) : marqueur à son centre, pour la repérer même dézoomé
function ZoneCommercialeMarkerIcon(color) {
  return L.IconMaterial.icon({
    icon: "storefront",
    iconColor: "#fff",
    markerColor: color || "#e3a82b",
    outlineColor: "white",
    outlineWidth: 0.5,
    iconSize: [31, 42],
  });
}
// Foire annoncée par une ville (vue Commerces) : Shard-API /marches/list
var FoireColor = "#b02e26";
function FoireMarkerIcon() {
  return L.IconMaterial.icon({
    icon: "festival",
    iconColor: "#fff",
    markerColor: FoireColor,
    outlineColor: "white",
    outlineWidth: 0.5,
    iconSize: [31, 42],
  });
}
// Textes de cartographie en lecture seule (même rendu que la zone de texte
// de leaflet-geoman utilisée dans l'éditeur)
var CartographieTextDefaultColor = "#f2f2f2";
function CartographieTextColor(color) {
  return /^#[0-9a-f]{3,8}$/i.test(color || "") ? color : CartographieTextDefaultColor;
}
function CartographieTextMarker(coords, text, color, options = {}) {
  return L.marker(coords, {
    ...options,
    icon: L.divIcon({
      className: "",
      iconSize: null,
      iconAnchor: [0, 0],
      html: `<div style="display:inline-block;white-space:pre;background-color:rgba(0,0,0,0.7);color:${CartographieTextColor(color)};border-radius:3px;padding:4px 7px 0 7px;font-size:13px;line-height:17px;">${escapeHtml(text)}</div>`,
    }),
  });
}
// Couleurs des religions : champ `color` de la religion s'il s'agit d'une
// couleur CSS valide (ce qui exclut toute injection dans le HTML/SVG), sinon
// couleur de la palette dérivée de l'identifiant. Même règle que ShardUI-2
// (src/utils/religionColor.js), une religion garde sa couleur.
// Palette : teintures de bannière du jeu (charte Tetrago).
var ReligionColors = [
  "#3c44aa", // bleu
  "#b02e26", // rouge
  "#5e7c16", // vert
  "#f9801d", // orange
  "#8932b8", // violet
  "#169c9c", // cyan
  "#c74ebd", // magenta
  "#80c71f", // vert clair
  "#835432", // marron
  "#3ab3da", // bleu clair
];
function ReligionColor(religion) {
  const color = typeof religion?.color === "string" ? religion.color.trim() : "";
  if (color && CSS.supports("color", color)) return color;
  return ReligionColors[Math.abs(parseInt(religion?.id) || 0) % ReligionColors.length];
}
function ReligionIcon(color) {
  return L.IconMaterial.icon({
    icon: "church",
    iconColor: "#fff",
    markerColor: color,
    outlineColor: "white",
    outlineWidth: 0.5,
    iconSize: [31, 42],
  });
}
var ShopIcon = L.AwesomeMarkers.icon({
  prefix: "fa",
  icon: "shop",
  iconColor: "#fff",
  markerColor: "purple",
});
