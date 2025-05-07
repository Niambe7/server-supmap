// itinerary-service/controllers/itineraryController.js

const { Client } = require('@googlemaps/google-maps-services-js');
const polyline = require('@mapbox/polyline');
const Itinerary = require('../models/Itinerary');
const axios = require('axios');

const client = new Client({});

const INCIDENT_URL = process.env.INCIDENT_SERVICE_URL
  || 'https://api.supmap-server.pp.ua/incidents/incidents/getincdentactiverecalcul';


/**
 * ▶️ Propose plusieurs itinéraires (au moins 2) sans les sauvegarder.
 */
 const searchItinerary = async (req, res) => {
  const { start_location, end_location, avoidTolls } = req.body;
  if (!start_location || !end_location) {
    return res.status(400).json({ error: 'start_location et end_location requis.' });
  }

  try {
    const { data } = await client.directions({
      params: {
        origin: start_location,
        destination: end_location,
        mode: 'driving',
        overview: 'full',
        alternatives: true,
        key: process.env.GOOGLE_API_KEY,
        ...(avoidTolls ? { avoid: 'tolls' } : {}),
      },
    });

    if (!data.routes || data.routes.length === 0) {
      return res.status(404).json({ error: 'Aucun itinéraire trouvé.' });
    }

    const itineraries = data.routes.map((route, index) => {
      // Récupération des étapes détaillées
      const steps = route.legs[0].steps;

      // Construction du tracé géométrique à partir des steps
      const routePoints = [];
      for (const step of steps) {
        const pts = polyline.decode(step.polyline.points)
          .map(([lat, lng]) => ({ lat, lng }));
        if (routePoints.length) pts.shift();
        routePoints.push(...pts);
      }

      return {
        id: index,
        distance: route.legs[0].distance.value,
        duration: route.legs[0].duration.value,
        toll_free: Boolean(avoidTolls),
        steps,                                        // ← on expose maintenant les instructions
        route_points: routePoints,                    // pour l'affichage client
        encoded_polyline: route.overview_polyline.points // utile si besoin de snap-to-roads
      };
    });

    return res.status(200).json({
      message: 'Itinéraires générés',
      itineraries
    });

  } catch (err) {
    console.error('❗ Erreur searchItinerary :', err.response?.data || err.message);
    return res.status(500).json({
      error: "Erreur lors de la recherche d'itinéraires.",
      details: err.response?.data || err.message
    });
  }
};


const loadItinerary = async (req, res) => {
  const { user_id, start_location, end_location, selected_itinerary } = req.body;

  if (!user_id || !start_location || !end_location || !selected_itinerary) {
    return res.status(400).json({
      error: 'user_id, start_location, end_location et selected_itinerary requis.'
    });
  }

  const {
    steps,
    route_points: rawPoints,
    duration,
    distance,
    toll_free
  } = selected_itinerary;

  // On essaie d'abord de décoder les steps, sinon on retombe sur les rawPoints envoyés
  let route_points;
  if (Array.isArray(steps) && steps.length > 0) {
    route_points = steps.flatMap(step =>
      polyline.decode(step.polyline.points).map(([lat, lng]) => ({ lat, lng }))
    );
  } else if (Array.isArray(rawPoints) && rawPoints.length > 0) {
    route_points = rawPoints;
  } else {
    return res.status(400).json({
      error: 'selected_itinerary.steps ou selected_itinerary.route_points requis.'
    });
  }

  try {
    const itinerary = await Itinerary.create({
      user_id,
      start_location,
      end_location,
      route_points,    // jamais null maintenant
      duration,
      distance,
      cost: 0,
      toll_free,
      steps
    });

    return res.status(201).json({
      message: 'Itinéraire sélectionné enregistré',
      itinerary
    });
  } catch (err) {
    console.error('❗ Erreur loadItinerary :', err.message);
    return res.status(500).json({
      error: "Erreur lors de l'enregistrement de l'itinéraire.",
      details: err.message
    });
  }
};






// 🔁 Recalculer l'itinéraire en cas d'incidents
const recalculateItinerary = async (req, res) => {
  const {
    itinerary_id,
    current_position,
    new_end_location
  } = req.body;

  if (!itinerary_id) {
    console.log("❗ recalculateItinerary: missing itinerary_id");
    return res.status(400).json({ error: "Le champ 'itinerary_id' est requis." });
  }

  try {
    // 1) Charger l'itinéraire existant
    const itinerary = await Itinerary.findByPk(itinerary_id);
    if (!itinerary) {
      console.log(`❗ recalculateItinerary: itinéraire ${itinerary_id} non trouvé`);
      return res.status(404).json({ error: 'Itinéraire non trouvé.' });
    } 

    // 2) Origin / destination
    const origin = (current_position?.lat != null && current_position?.lng != null)
      ? `${current_position.lat},${current_position.lng}`
      : itinerary.start_location;
    const destination = new_end_location || itinerary.end_location;
    console.log(`▶️ recalc: origin=${origin}, destination=${destination}`);

    // 3) Récupérer les incidents actifs
    console.log(`▶️ recalc: appel à ${INCIDENT_URL}`);
    const resp = await axios.get(INCIDENT_URL, {
      headers: { Authorization: req.headers.authorization }
    });
    console.log("▶️ recalc: resp.data =", resp.data);

    // 4) Extraire le tableau d'incidents
    let activeIncidents = [];
    if (Array.isArray(resp.data)) {
      activeIncidents = resp.data;
    } else if (Array.isArray(resp.data.incidents)) {
      activeIncidents = resp.data.incidents;
    }
    console.log(`▶️ recalc: incidents actifs extraits (${activeIncidents.length})`);

    if (activeIncidents.length === 0) {
      console.log("ℹ️ recalc: aucun incident actif");
      return res.status(200).json({
        message: 'Aucun incident actif, pas de recalcul nécessaire.',
        used_origin: origin,
        used_destination: destination,
        itinerary
      });
    }

    // 5) Log détails
    activeIncidents.forEach(inc => {
      console.log(`   • inc ${inc.id}: (${inc.latitude},${inc.longitude}), status=${inc.status}`);
    });

    // 6) Filtrer ceux qui croisent l’itinéraire
    const routePoints = itinerary.route_points;
    const tolerance = 0.001;
    const affectedIncidents = activeIncidents.filter(inc => {
      const close = routePoints.some(pt =>
        Math.abs(pt.lat - inc.latitude) < tolerance &&
        Math.abs(pt.lng - inc.longitude) < tolerance
      );
      console.log(`   → incident ${inc.id} ${close ? "impacte" : "n’impacte pas"}`);
      return close;
    });

    if (affectedIncidents.length === 0) {
      console.log("ℹ️ recalc: aucun incident ne touche l’itinéraire");
      return res.status(200).json({
        message: 'Aucun incident ne touche l’itinéraire, pas de recalcul.',
        used_origin: origin,
        used_destination: destination,
        itinerary
      });
    }
    console.log(`✅ recalc: ${affectedIncidents.length} incident(s) impactent l’itinéraire`);

    // 7) Recalcul Google
    console.log("▶️ recalc: appel Google Maps");
    const googleRes = await client.directions({
      params: { origin, destination, mode: 'driving', avoid: 'tolls', key: process.env.GOOGLE_API_KEY }
    });
    if (!googleRes.data.routes?.length) {
      console.error("❗ recalc: Google sans routes");
      return res.status(500).json({ error: 'Google n’a pas renvoyé de nouvel itinéraire.' });
    }
    const route0 = googleRes.data.routes[0];
    const decoded = polyline.decode(route0.overview_polyline.points);
    const newRoutePoints = decoded.map(([lat, lng]) => ({ lat, lng }));
    console.log("✅ recalc: itinéraire recalculé");

    // 8) Réponse
    return res.status(200).json({
      message: 'Itinéraire recalculé en évitant les incidents actifs',
      used_origin:      origin,
      used_destination: destination,
      old_route:        routePoints,
      new_route: {
        route_points:     newRoutePoints,
        distance:         route0.legs[0].distance.value,
        duration:         route0.legs[0].duration.value,
        encoded_polyline: route0.overview_polyline.points
      },
      affected_incidents: affectedIncidents
    });

  } catch (err) {
    console.error('❗ Erreur recalculateItinerary :', err.response?.data || err.message);
    return res.status(500).json({
      error:   'Erreur lors du recalcul de l’itinéraire.',
      details: err.response?.data || err.message
    });
  }
};


/**
 * ▶ Récupérer un itinéraire existant par son ID
 */
const getItineraryById = async (req, res) => {
  const { id } = req.params;
  console.log(`▶️ getItineraryById: requête pour itinéraire ${id}`);

  if (!id) {
    console.log('❗ getItineraryById: ID manquant');
    return res.status(400).json({ error: "Le paramètre 'id' est requis." });
  }

  try {
    const itinerary = await Itinerary.findByPk(id);

    if (!itinerary) {
      console.log(`❗ getItineraryById: itinéraire ${id} non trouvé`);
      return res.status(404).json({ error: 'Itinéraire non trouvé.' });
    }

    console.log(`✅ getItineraryById: itinéraire ${id} récupéré`);
    return res.status(200).json({ itinerary });
  } catch (err) {
    console.error('❗ getItineraryById: erreur interne', err.message);
    return res.status(500).json({
      error: 'Erreur lors de la récupération de l’itinéraire.',
      details: err.message
    });
  }
};


module.exports = { searchItinerary, loadItinerary, recalculateItinerary , getItineraryById};
