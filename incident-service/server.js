// incident-service/server.js
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

// Middleware global de log
app.use((req, res, next) => {
  console.log(`[Incident-Service] ${req.method} ${req.url}`);
  next();
});

// Monter les routes d'incident
const incidentRoutes = require('./routes/incidentRoutes');
app.use('/incidents', incidentRoutes);

const PORT = process.env.PORT || 7004;
const key = fs.readFileSync('incident-service.key');
const cert = fs.readFileSync('incident-service.crt');

sequelize.authenticate()
  .then(() => {
    console.log("Connexion à la base de données réussie.");
    return sequelize.sync({ alter: true }); // Force la recréation des tables
  })
  .then(() => {
    https.createServer({ key, cert }, app).listen(PORT, () => {
      console.log(`Incident-Service est en écoute en HTTPS sur le port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("Erreur de connexion à la base :", err);
  });
