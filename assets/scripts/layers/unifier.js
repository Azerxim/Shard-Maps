/**
 * Vue « Unifier » ({dimension}-unifier) : civilisations, commerces et guerres sur une même carte, avec une légende.
 *
 * Chaque thème reprend son calque (layers/civilisations.js, commerces.js, guerres.js) et devient un calque Leaflet
 * qu'on affiche ou masque dans le sélecteur de calques ; les thèmes masqués sont gardés dans l'adresse (&masques=…),
 * pour partager une vue. Les villes, déjà marquées par les civilisations, ne sont pas reprises du calque Guerres.
 * Un thème dont le chargement échoue est signalé dans la console et n'empêche pas les autres de s'afficher.
 * Sélecteur et légende sont ajoutés par pages/map.js (ui/legende.js) ; les cartes intégrées réunissent les thèmes.
 */

const THEMES_UNIFIES = [
  { cle: "civilisations", titre: "Civilisations", icone: "fa-solid fa-city", charger: (world) => MarkersCivilisations(world) },
  { cle: "commerces", titre: "Commerces", icone: "fa-solid fa-shop", charger: (world) => MarkersCommerces(world) },
  {
    cle: "guerres",
    titre: "Guerres",
    icone: "fa-solid fa-shield-halved",
    charger: async (world) => {
      const json = await MarkersGuerres(world);
      return { polygons: json.polygons, markers: json.markers.filter((marker) => marker.option !== "ville") };
    },
  },
];

// [{ cle, titre, icone, json }] dans l'ordre des thèmes (les frontières d'abord, les guerres par-dessus)
async function MarkersUnifier(world) {
  const resultats = await Promise.allSettled(THEMES_UNIFIES.map((theme) => theme.charger(world)));
  return THEMES_UNIFIES.map((theme, i) => {
    if (resultats[i].status === "rejected") {
      console.error(`Vue unifiée : calque ${theme.titre} indisponible`, resultats[i].reason);
      return { ...theme, json: { polygons: [], markers: [] } };
    }
    return { ...theme, json: resultats[i].value || { polygons: [], markers: [] } };
  });
}
