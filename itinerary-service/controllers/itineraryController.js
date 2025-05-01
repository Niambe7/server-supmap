// itinerary-service/controllers/itineraryController.js

const { Client } = require('@googlemaps/google-maps-services-js');
const polyline = require('@mapbox/polyline');
const Itinerary = require('../models/Itinerary');
const client = new Client({});


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



/**
 * ▶️ Charge et sauvegarde l'itinéraire sélectionné.
 *    Il décode la chaîne encodée, puis stocke les points.
 */
// const loadItinerary = async (req, res) => {
//   const { user_id, start_location, end_location, selected_itinerary } = req.body;
//   if (
//     !user_id ||
//     !start_location ||
//     !end_location ||
//     !selected_itinerary?.encoded_polyline
//   ) {
//     return res.status(400).json({
//       error: 'user_id, start_location, end_location et selected_itinerary.encoded_polyline requis.'
//     });
//   }

//   try {
//     // Décodage de la chaîne polyline
//     const decoded = polyline.decode(selected_itinerary.encoded_polyline)
//       .map(([lat, lng]) => ({ lat, lng }));

//     // Création en base
//     const itinerary = await Itinerary.create({
//       user_id,
//       start_location,
//       end_location,
//       route_points: decoded,
//       duration: selected_itinerary.duration,
//       distance: selected_itinerary.distance,
//       cost: 0,
//       toll_free: selected_itinerary.toll_free
//     });

//     return res.status(201).json({
//       message: 'Itinéraire sélectionné enregistré',
//       itinerary
//     });

//   } catch (err) {
//     console.error('❗ Erreur loadItinerary :', err.message);
//     return res.status(500).json({
//       error: "Erreur lors de l'enregistrement de l'itinéraire.",
//       details: err.message
//     });
//   }
// };


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
  const { itinerary_id, incidents = [] } = req.body;

  // Validation du champ itinerary_id
  if (!itinerary_id) {
    return res.status(400).json({
      error: "Le champ 'itinerary_id' est requis."
    });
  }

  try {
    // Récupérer l'itinéraire existant par son identifiant
    const itinerary = await Itinerary.findByPk(itinerary_id);
    if (!itinerary) {
      return res.status(404).json({ error: 'Itinéraire non trouvé.' });
    }

    const routePoints = itinerary.route_points; // Déjà un objet JSON
    let activeIncidents = incidents;
    if (activeIncidents.length === 0) {
      // Vous pouvez ici intégrer une requête sur une table incidents si nécessaire.
      activeIncidents = []; // Pour cet exemple, on reste vide.
    }

    // Déterminer les incidents affectant l'itinéraire, en comparant chaque point
    const tolerance = 0.01;
    const affectedIncidents = activeIncidents.filter(incident =>
      routePoints.some(point =>
        Math.abs(point.lat - incident.latitude) < tolerance &&
        Math.abs(point.lng - incident.longitude) < tolerance
      )
    );

    if (affectedIncidents.length === 0) {
      return res.status(200).json({
        message: 'Aucun recalcul nécessaire',
        itinerary
      });
    }

    // Appel à l'API Google Maps pour recalculer l'itinéraire en évitant les péages
    const response = await client.directions({
      params: {
        origin: itinerary.start_location,
        destination: itinerary.end_location,
        mode: 'driving',
        avoid: 'tolls',
        key: process.env.GOOGLE_API_KEY,
      },
    });

    const newEncodedPolyline = response.data.routes[0].overview_polyline.points;
    const newDecodedPoints = polyline.decode(newEncodedPolyline);
    const newRoutePoints = newDecodedPoints.map(([lat, lng]) => ({ lat, lng }));

    return res.status(200).json({
      message: 'Itinéraire recalculé en évitant les incidents',
      old_route: routePoints,
      new_route: {
        route_points: newRoutePoints,
        duration: response.data.routes[0].legs[0].duration.value,
        distance: response.data.routes[0].legs[0].distance.value,
      },
      affected_incidents: affectedIncidents,
    });
  } catch (error) {
    console.error("Erreur lors du recalcul de l'itinéraire :", error.message);
    return res.status(500).json({
      error: "Erreur lors du recalcul de l'itinéraire."
    });
  }
};

module.exports = { searchItinerary, loadItinerary, recalculateItinerary };
