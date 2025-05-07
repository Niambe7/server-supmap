// src/app.js
const express       = require('express');
const sequelize     = require('./config/db');
const authRoutes    = require('./routes/authRoutes');
const errorHandler  = require('./middleware/errorHandler');
require('dotenv').config();

const app = express();
app.use(express.json());

app.use('/', authRoutes);

// Gestion des erreurs
app.use(errorHandler);

// Sync Sequelize
sequelize.authenticate()
  .then(() => console.log('👍 DB connectée'))
  .then(() => sequelize.sync())  // en dev, ou gère tes migrations
  .catch(err => console.error('❌ DB Error:', err));

module.exports = app;
