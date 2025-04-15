// itinerary-service/server.js
const https = require('https');
const fs = require('fs');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const sequelize = require('./config/db');
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Middleware de log pour l’Itinerary-Service
app.use((req, res, next) => {
  console.log(`[Itinerary-Service] ${req.method} ${req.url}`);
  next();
});

// Monter les routes d'itinéraire
const itineraryRoutes = require('./routes/itineraryRoutes');
app.use('/itineraries', itineraryRoutes);

const PORT = process.env.PORT || 7003;
const key = fs.readFileSync('itinerary-service.key');  // Renommé avec mkcert
const cert = fs.readFileSync('itinerary-service.crt');   // Renommé avec mkcert

sequelize.authenticate()
  .then(() => {
    console.log("Connexion à la base de données (Supmap-itinerarydb) réussie.");
    return sequelize.sync();
  })
  .then(() => {
    https.createServer({ key, cert }, app).listen(PORT, () => {
      console.log(`Itinerary-Service est en écoute en HTTPS sur le port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("Erreur de connexion à la base de données :", err);
  });
