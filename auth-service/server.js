// auth-service/server.js
const https = require('https');
const fs = require('fs');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const sequelize = require('./config/db');

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Middleware de log global
app.use((req, res, next) => {
  console.log(`[Auth-Service] ${req.method} ${req.url}`);
  next();
});

// Monter les routes d'authentification
const authRoutes = require('./routes/authRoutes');
app.use('/auth', authRoutes);

const PORT = process.env.PORT || 7002;
const key = fs.readFileSync('auth-service.key');  // Certificat privé
const cert = fs.readFileSync('auth-service.crt');   // Certificat

// Tester la connexion à la base et synchroniser (optionnel en prod)
sequelize.authenticate()
  .then(() => {
    console.log("Connexion à la base de données réussie.");
    return sequelize.sync(); // synchroniser les modèles, utile en dev
  })
  .then(() => {
    https.createServer({ key, cert }, app).listen(PORT, () => {
      console.log(`Auth-Service est en écoute en HTTPS sur le port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("Erreur lors de la connexion DB:", err);
  });
