// auth-service/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Route pour se connecter : POST /auth/login
router.post('/login', authController.login);

module.exports = router;
