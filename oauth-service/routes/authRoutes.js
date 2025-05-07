// src/routes/authRoutes.js
const express = require('express');
const { googleToken } = require('../controllers/authController');
const router = express.Router();

router.post('/auth/google/token', googleToken);

module.exports = router;
