/**
 * Légende de la carte complète (index.html) : symboles de chaque vue (Unifier, Civilisations, Commerces, Alliances,
 * Religions, Guerres), dessinés à partir des vraies icônes des marqueurs. Repliable, en haut à droite sous le sélecteur
 * de calques, repliée par défaut : un clic sur « Légende » l'ouvre. Les cartes intégrées (embed, embedfull) et la page locate
 * n'en ont pas.
 *
 * Chargé après core/markers.js et les calques (layers/*.js), dont il reprend les icônes et les couleurs.
 */

const LEGENDE_THEMES = {
  civilisations: { titre: "Civilisations", icone: "fa-solid fa-city" },
  commerces: { titre: "Commerces", icone: "fa-solid fa-shop" },
  alliances: { titre: "Alliances", icone: "fa-solid fa-handshake" },
  religions: { titre: "Religions", icone: "fa-solid fa-place-of-worship" },
  guerres: { titre: "Guerres", icone: "fa-solid fa-shield-halved" },
};

// Libellé d'un thème (légende, sélecteur de calques de la vue unifiée)
function legendeThemeLabel(theme) {
  return `<i class="${theme.icone}" style="width:1.1em"></i> ${theme.titre}`;
}

// Copie réduite d'une icône de marqueur
function legendeIcone(icon) {
  const boite = document.createElement("span");
  boite.style.cssText = "display:inline-flex;align-items:flex-end;justify-content:center;width:22px;height:28px;flex-shrink:0;";
  boite.setAttribute("aria-hidden", "true");
  const element = icon.createIcon();
  element.style.position = "static";
  element.style.flexShrink = "0"; // sinon la boîte comprime l'icône avant sa réduction
  element.style.margin = "0";
  element.style.transform = "scale(0.62)";
  element.style.transformOrigin = "bottom center";
  boite.appendChild(element);
  return boite;
}

// Échantillon de zone : contour (plein ou en pointillés) et remplissage léger
function legendeTrait({ couleur, pointilles = false, remplissage = 0.25 }) {
  const boite = document.createElement("span");
  boite.style.cssText =
    `display:inline-block;width:22px;height:14px;flex-shrink:0;border:2px ${pointilles ? "dashed" : "solid"} ${couleur};` +
    `background:${couleur}${Math.round(remplissage * 255).toString(16).padStart(2, "0")};border-radius:3px;`;
  boite.setAttribute("aria-hidden", "true");
  return boite;
}

// Symboles de chaque thème : [{ symbole: () => élément, texte }]. avecVilles : la vue Guerres seule marque aussi les
// villes (dans la vue unifiée, elles viennent du thème Civilisations)
function legendeEntrees(cle, { avecVilles = false } = {}) {
  const villes = [
    { symbole: () => legendeIcone(CapitaleIcon), texte: "Capitale" },
    { symbole: () => legendeIcone(CityIcon), texte: "Ville" },
  ];
  switch (cle) {
    case "civilisations":
      return [
        ...villes,
        { symbole: () => legendeIcone(QuartierIcon), texte: "Quartier" },
        { symbole: () => legendeTrait({ couleur: "#3388ff" }), texte: "Frontières (couleur de la civilisation)" },
        { symbole: () => legendeIcone(CartographieMarkerIcon()), texte: "Repère tracé par la civilisation" },
      ];
    case "commerces":
      return [
        { symbole: () => legendeIcone(ShopIcon), texte: "Magasin" },
        { symbole: () => legendeIcone(SiegeIcon), texte: "Siège d'un commerce" },
        { symbole: () => legendeIcone(ZoneCommercialeMarkerIcon()), texte: "Zone commerciale" },
        { symbole: () => legendeIcone(FoireMarkerIcon()), texte: "Foire" },
      ];
    case "alliances":
      return [
        { symbole: () => legendeIcone(CartographieMarkerIcon("#b3263a")), texte: "Ville d'une civilisation membre (couleur de l'alliance)" },
        { symbole: () => legendeTrait({ couleur: "#b3263a" }), texte: "Frontières aux couleurs de l'alliance" },
        { symbole: () => legendeIcone(CartographieMarkerIcon("#6b7280")), texte: "Alliance sans couleur choisie" },
        { symbole: () => null, texte: "Membre de plusieurs alliances : couleur de l'alliance militaire" },
      ];
    case "religions":
      return [
        { symbole: () => legendeIcone(ReligionIcon("#7c3aed")), texte: "Ville (couleur de la religion majoritaire)" },
        { symbole: () => legendeTrait({ couleur: "#7c3aed" }), texte: "Frontières de la ville, même couleur" },
        { symbole: () => legendeIcone(ReligionIcon(SANS_RELIGION_COLOR)), texte: "Ville sans religion publique" },
      ];
    case "guerres":
      return [
        ...(avecVilles ? villes.map((v) => ({ ...v, texte: `${v.texte} (« ⚔ » : civilisation en guerre)` })) : []),
        { symbole: () => legendeTrait({ couleur: GUERRE_ZONE_COLORS.en_cours }), texte: "Zone de conflit, guerre en cours" },
        { symbole: () => legendeTrait({ couleur: GUERRE_ZONE_COLORS.terminee }), texte: "Zone de conflit, guerre terminée" },
        { symbole: () => legendeIcone(DestructibleMarkerIcon()), texte: "Bâtiment destructible" },
        { symbole: () => legendeTrait({ couleur: DestructibleDefaultColor, pointilles: true, remplissage: 0.15 }), texte: "Zone destructible" },
      ];
    default:
      return [];
  }
}

// themes : [{ cle, titre, icone, entrees }] ; update(masques) n'affiche que les thèmes visibles
const LegendeControl = L.Control.extend({
  options: { position: "topright" },

  initialize: function (themes, options) {
    L.setOptions(this, options);
    this._themes = themes;
  },

  onAdd: function () {
    const container = L.DomUtil.create("div", "leaflet-control leaflet-bar bg-base-200 rounded-box");
    container.style.cssText = "padding:6px 10px;max-width:250px;font-size:12px;";
    container.setAttribute("aria-label", "Légende de la carte");
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    const details = document.createElement("details");
    details.open = false; // repliée par défaut, quelle que soit la largeur
    const summary = document.createElement("summary");
    summary.style.cssText = "cursor:pointer;font-weight:700;";
    summary.textContent = "Légende";
    details.appendChild(summary);
    this._liste = document.createElement("div");
    details.appendChild(this._liste);
    container.appendChild(details);
    this.update([]);
    return container;
  },

  // masques : clés des thèmes masqués
  update: function (masques) {
    if (!this._liste) return;
    this._liste.replaceChildren();
    const plusieurs = this._themes.length > 1;
    for (const theme of this._themes) {
      if (masques.includes(theme.cle)) continue;
      if (plusieurs) {
        const titre = document.createElement("div");
        titre.style.cssText = "margin-top:6px;font-weight:600;";
        titre.innerHTML = legendeThemeLabel(theme);
        this._liste.appendChild(titre);
      }
      for (const { symbole, texte } of theme.entrees || []) {
        const ligne = document.createElement("div");
        ligne.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:2px;";
        const element = symbole();
        if (element) ligne.appendChild(element);
        const libelle = document.createElement("span");
        libelle.textContent = texte;
        if (!element) libelle.style.cssText = "font-style:italic;opacity:.8;";
        ligne.appendChild(libelle);
        this._liste.appendChild(ligne);
      }
    }
    if (!this._liste.children.length) {
      const vide = document.createElement("i");
      vide.textContent = "Tous les thèmes sont masqués.";
      this._liste.appendChild(vide);
    }
  },
});

// Légende d'une vue de la carte complète (pathname.option), ou null si la vue n'en a pas
function legendeVue(option) {
  const theme = LEGENDE_THEMES[option];
  if (!theme) return null;
  return new LegendeControl([{ cle: option, ...theme, entrees: legendeEntrees(option, { avecVilles: option === "guerres" }) }]);
}
