// itinerary-service/routes/itineraryRoutes.js
const express = require('express');
const router = express.Router();
const itineraryController = require('../controllers/itineraryController');

// Route pour créer un itinéraire
router.post('/search', itineraryController.searchItinerary);

router.post('/load', itineraryController.loadItinerary);

// Route pour recalculer un itinéraire
router.post('/recalculate', itineraryController.recalculateItinerary);

router.get('/:id', itineraryController.getItineraryById);

module.exports = router;
