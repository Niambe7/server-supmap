// itinerary-service/controllers/itineraryController.js

const { Client } = require('@googlemaps/google-maps-services-js');
const polyline = require('@mapbox/polyline');
const Itinerary = require('../models/Itinerary');
const client = new Client({});

// ▶️ Créer un itinéraire, en tenant compte du choix d'éviter les péages
const searchItinerary = async (req, res) => {
  // Extraction des paramètres depuis le body
  const { start_location, end_location, user_id, avoidTolls } = req.body;

  // Validation des champs obligatoires
  if (!start_location || !end_location || !user_id) {
    return res.status(400).json({
      error: 'Les champs start_location, end_location et user_id sont requis.'
    });
  }

  try {
    // Préparation des paramètres pour l'API Google Maps Directions
    const params = {
      origin: start_location,
      destination: end_location,
      mode: 'driving',
      key: process.env.GOOGLE_API_KEY
    };

    // Si l'utilisateur souhaite éviter les péages, ajouter le paramètre 'avoid'
    if (avoidTolls) {
      params.avoid = 'tolls';
    }

    // Appel à l'API Google Maps pour obtenir l'itinéraire
    const response = await client.directions({ params });
    const route = response.data.routes[0];

    // Décodage de la polyline pour obtenir les points du trajet
    const encodedPolyline = route.overview_polyline.points;
    const decodedPoints = polyline.decode(encodedPolyline);
    const routePoints = decodedPoints.map(([lat, lng]) => ({ lat, lng }));

    // Création de l'itinéraire dans la base de données via Sequelize
    const itinerary = await Itinerary.create({
      user_id,
      start_location,
      end_location,
      route_points: routePoints,
      duration: route.legs[0].duration.value,   // Durée en secondes
      distance: route.legs[0].distance.value,     // Distance en mètres
      cost: 0,                                    // Coût par défaut
      toll_free: avoidTolls ? true : false        // En fonction du paramètre envoyé
    });

    return res.status(201).json({
      message: 'Itinéraire créé',
      itinerary
    });
  } catch (error) {
    console.error("Erreur lors de la recherche d'itinéraire :", error.message);
    return res.status(500).json({
      error: "Erreur lors de la recherche d'itinéraire."
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

module.exports = { searchItinerary, recalculateItinerary };
