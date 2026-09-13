var udbIcon = L.IconMaterial.icon({
  icon: "",
  iconColor: "#fff",
  markerColor: "#2e3144",
  outlineColor: "white",
  outlineWidth: 0.5,
  iconSize: [31, 42],
});
var redIcon = L.IconMaterial.icon({
  icon: "",
  iconColor: "#fff",
  markerColor: "#d32300",
  outlineColor: "white",
  outlineWidth: 0.5,
  iconSize: [31, 42],
});
var blueIcon = L.IconMaterial.icon({
  icon: "",
  iconColor: "#fff",
  markerColor: "#008ed7",
  outlineColor: "white",
  outlineWidth: 0.5,
  iconSize: [31, 42],
});
var cyanIcon = L.IconMaterial.icon({
  icon: "",
  iconColor: "#fff",
  markerColor: "#167b8c",
  outlineColor: "white",
  outlineWidth: 0.5,
  iconSize: [31, 42],
});
var upIcon = L.IconMaterial.icon({
  icon: "",
  iconColor: "#fff",
  markerColor: "#6821a0",
  outlineColor: "white",
  outlineWidth: 0.5,
  iconSize: [31, 42],
});
var yellowIcon = L.IconMaterial.icon({
  icon: "",
  iconColor: "#fff",
  markerColor: "#F0C300",
  outlineColor: "white",
  outlineWidth: 0.5,
  iconSize: [31, 42],
});
var greenIcon = L.IconMaterial.icon({
  icon: "",
  iconColor: "#fff",
  markerColor: "#219653",
  outlineColor: "white",
  outlineWidth: 0.5,
  iconSize: [31, 42],
});

var SpawnIcon = L.IconMaterial.icon({
  icon: "home",
  iconColor: "#fff",
  markerColor: "#000",
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
var CartographieMarkerDefaultColor = "#6821a0";
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
// (src/components/Functions/religionColor.js), une religion garde sa couleur.
var ReligionColors = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#d97706",
  "#9333ea",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#ea580c",
  "#4f46e5",
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
