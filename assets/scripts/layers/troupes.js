/**
 * Troupes d'une guerre sur la carte intégrée à sa fiche (embed « guerres » de ShardUI-2, /guerre/:id).
 *
 * Les troupes ne sont vues que de leur camp et des modérateurs RP (Shard-API crud_troupes) : la carte, servie sur une
 * autre origine et sans session, ne les demande donc pas à l'API. C'est la fiche de la guerre qui les lui envoie,
 * telles que son visiteur a le droit de les voir, par postMessage (aucun jeton ne transite) :
 *  - la carte annonce qu'elle est prête : { source: "minedmap", type: "embed-ready" } vers la page parente ;
 *  - la page répond, puis renvoie à chaque changement : { source: "shardui", type: "guerre-troupes", zones, troupes }
 *    (seulement ce qui est dans le monde affiché) ; seul un message de la page parente, sur une origine autorisée
 *    (UI_BASE_URL, UI_ALLOWED_ORIGINS : shardApiAllowedUiOrigins de shard-api.js), est pris en compte.
 *
 * Dessin : sur un champ de bataille, un marqueur par camp au centre de la zone (effectif total, liste des troupes) ;
 * en mouvement vers une zone, une flèche en pointillés depuis la ville d'origine (point de départ à la couleur du camp,
 * pointe orientée vers la destination) ; sans destination annoncée, un marqueur « en marche » près de la ville d'origine.
 */

const TROUPES_COULEURS = { attaquant: "#dc2626", defenseur: "#2563eb" };
const TROUPES_CAMPS = { attaquant: "Attaquants", defenseur: "Défenseurs" };

// Centre d'une zone de conflit (coordonnées Leaflet [-z, x]) : point du marqueur, centre du cercle, moyenne des sommets
function troupesZoneCenter(zone) {
  let coords;
  try {
    coords = JSON.parse(zone.coordinates);
  } catch (e) {
    return null;
  }
  if (zone.shape_type === "Marker" || zone.shape_type === "Text") return coords;
  if (zone.shape_type === "Circle") return coords[0];
  const points = [];
  const collect = (value) => {
    if (Array.isArray(value) && value.length === 2 && typeof value[0] === "number") points.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value.lat === "number") points.push([value.lat, value.lng]);
  };
  collect(coords);
  if (!points.length) return null;
  return [
    points.reduce((s, p) => s + p[0], 0) / points.length,
    points.reduce((s, p) => s + p[1], 0) / points.length,
  ];
}

// Pastille du camp ; decalage : -1 (attaquants à gauche), 1 (défenseurs à droite) quand les deux camps partagent un champ
function troupesIcon(camp, texte, icone, decalage = 0) {
  const couleur = TROUPES_COULEURS[camp] || "#6b7280";
  return L.divIcon({
    className: "troupe-marqueur",
    html: `<div style="display:flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:${couleur};color:#fff;font-weight:700;font-size:12px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.4);border:2px solid #fff;"><i class="fa-solid ${icone}"></i><span>${escapeHtml(String(texte))}</span></div>`,
    iconSize: null,
    iconAnchor: [decalage < 0 ? 70 : decalage > 0 ? -10 : 30, 12],
    popupAnchor: [0, -12],
  });
}

// Pointe de flèche orientée de depart vers arrivee (coordonnées Leaflet [-z, x] : le nord est en haut de l'écran)
function troupesPointe(depart, arrivee, couleur) {
  const angle = (Math.atan2(-(arrivee[0] - depart[0]), arrivee[1] - depart[1]) * 180) / Math.PI;
  return L.marker(arrivee, {
    interactive: false,
    zIndexOffset: 800,
    icon: L.divIcon({
      className: "troupe-fleche",
      html: `<svg width="22" height="22" viewBox="0 0 22 22" style="transform:rotate(${angle}deg);overflow:visible"><path d="M2 3 L20 11 L2 19 L7 11 Z" fill="${couleur}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    }),
  });
}

// Point de départ d'une marche : la ville d'origine, même privée (absente du calque des villes)
function troupesDepart(depart, couleur, troupe) {
  return L.circleMarker(depart, { radius: 6, color: "#fff", weight: 2, fillColor: couleur, fillOpacity: 1 })
    .bindTooltip(`<b>Départ : ${escapeHtml(troupe.ville.title)}</b>`, { className: "bg-base-100" });
}

function troupesLigne(troupe) {
  const mercenaires = troupe.mercenaire
    ? ` · mercenaires de ${escapeHtml(troupe.civilisation || "?")} au service de ${escapeHtml(troupe.employeur || "?")}`
    : troupe.civilisation ? ` · ${escapeHtml(troupe.civilisation)}` : "";
  return `<li><b>${escapeHtml(troupe.title)}</b> : ${troupe.effectif} soldat${troupe.effectif > 1 ? "s" : ""}${mercenaires}</li>`;
}

function troupesPopup(titre, troupes, details = "") {
  return `
    <div class="flex flex-col gap-2">
      <b>${titre}</b>
      ${details ? `<span>${details}</span>` : ""}
      <ul class="list-disc pl-4">${troupes.map(troupesLigne).join("")}</ul>
    </div>`;
}

function troupesDessiner(groupe, zones, troupes) {
  groupe.clearLayers();
  const zonesParId = new Map((zones || []).map((zone) => [zone.id, zone]));
  const centres = new Map();
  const centre = (zoneId) => {
    if (!centres.has(zoneId)) centres.set(zoneId, zonesParId.has(zoneId) ? troupesZoneCenter(zonesParId.get(zoneId)) : null);
    return centres.get(zoneId);
  };
  const origine = (troupe) => (troupe.ville && troupe.ville.x != null && troupe.ville.z != null ? [-troupe.ville.z, troupe.ville.x] : null);

  // Champs de bataille : une pastille par camp et par zone
  const champs = new Map();
  for (const troupe of troupes || []) {
    if (troupe.position !== "champ_de_bataille" || !centre(troupe.zone_id)) continue;
    const cle = `${troupe.zone_id}:${troupe.camp}`;
    if (!champs.has(cle)) champs.set(cle, { zone: zonesParId.get(troupe.zone_id), camp: troupe.camp, troupes: [] });
    champs.get(cle).troupes.push(troupe);
  }
  const campsParZone = new Map();
  for (const { zone, camp } of champs.values()) campsParZone.set(zone.id, [...(campsParZone.get(zone.id) || []), camp]);
  for (const { zone, camp, troupes: liste } of champs.values()) {
    const total = liste.reduce((s, t) => s + t.effectif, 0);
    const deuxCamps = campsParZone.get(zone.id).length > 1;
    const decalage = deuxCamps ? (camp === "attaquant" ? -1 : 1) : 0;
    const nomZone = zone.title || "Champ de bataille";
    L.marker(centre(zone.id), { icon: troupesIcon(camp, total, "fa-people-group", decalage), zIndexOffset: 1000 })
      .addTo(groupe)
      .bindTooltip(`<b>${TROUPES_CAMPS[camp] || camp} · ${total} soldat${total > 1 ? "s" : ""}</b>`, { className: "bg-base-100" })
      .bindPopup(troupesPopup(`${TROUPES_CAMPS[camp] || camp} sur ${escapeHtml(nomZone)}`, liste), { className: "customPopup" });
  }

  // En mouvement : flèche de la ville d'origine vers la destination, ou marqueur près de la ville sans destination
  for (const troupe of troupes || []) {
    if (troupe.position !== "en_mouvement") continue;
    const depart = origine(troupe);
    const arrivee = troupe.zone_id ? centre(troupe.zone_id) : null;
    const couleur = TROUPES_COULEURS[troupe.camp] || "#6b7280";
    if (depart && arrivee) {
      L.polyline([depart, arrivee], { color: couleur, weight: 3, dashArray: "8 8", opacity: 0.9, interactive: false }).addTo(groupe);
      troupesDepart(depart, couleur, troupe).addTo(groupe);
      troupesPointe(depart, arrivee, couleur).addTo(groupe);
      const position = [depart[0] + (arrivee[0] - depart[0]) * 0.6, depart[1] + (arrivee[1] - depart[1]) * 0.6];
      const destination = escapeHtml(zonesParId.get(troupe.zone_id).title || "un champ de bataille");
      L.marker(position, { icon: troupesIcon(troupe.camp, troupe.effectif, "fa-person-hiking"), zIndexOffset: 900 })
        .addTo(groupe)
        .bindTooltip(`<b>${escapeHtml(troupe.title)} → ${destination}</b>`, { className: "bg-base-100" })
        .bindPopup(troupesPopup(`En marche vers ${destination}`, [troupe], `Partie de ${escapeHtml(troupe.ville.title)}`), { className: "customPopup" });
    } else if (depart || arrivee) {
      const lieu = depart || arrivee;
      const details = depart ? `Partie de ${escapeHtml(troupe.ville.title)}, destination non annoncée` : "Point de départ inconnu";
      L.marker(lieu, { icon: troupesIcon(troupe.camp, `${troupe.effectif} ?`, "fa-person-hiking", 1), zIndexOffset: 900 })
        .addTo(groupe)
        .bindTooltip(`<b>${escapeHtml(troupe.title)} · en marche</b>`, { className: "bg-base-100" })
        .bindPopup(troupesPopup("En marche", [troupe], details), { className: "customPopup" });
    }
  }
}

// À appeler une fois la carte créée, dans une carte intégrée à une page du site
function TroupesGuerre(map) {
  if (window.parent === window) return null;
  const groupe = L.layerGroup().addTo(map);
  const origines = shardApiAllowedUiOrigins();

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.data?.source !== "shardui" || event.data?.type !== "guerre-troupes") return;
    if (!origines.includes(event.origin)) {
      console.warn("Carte : troupes ignorées de l'origine non autorisée " + event.origin);
      return;
    }
    troupesDessiner(groupe, event.data.zones, event.data.troupes);
  });
  // L'annonce ne contient rien : la page parente répond avec ce que son visiteur peut voir
  window.parent.postMessage({ source: "minedmap", type: "embed-ready" }, "*");
  return groupe;
}
