// incident-service/routes/incidentRoutes.js
const express = require('express');
const router = express.Router();
const incidentController = require('../controllers/incidentController');
const authMiddleware = require('../middleware/authMiddleware'); // Middleware d'authentification existant
const adminMiddleware = require('../middleware/adminMiddleware'); // Middleware admin

// Route pour signaler un incident (accessible aux utilisateurs authentifiés)
router.post('/report', authMiddleware, incidentController.reportIncident);

// Route pour approuver un incident (accessible uniquement aux administrateurs)
router.put('/:id/approve', authMiddleware, adminMiddleware, incidentController.approveIncident);

// Route pour résoudre (lever) un incident (accessible aux admins)
router.put('/:id/resolve', authMiddleware, adminMiddleware, incidentController.resolveIncident);

module.exports = router;
