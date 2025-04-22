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

sequelize.authenticate()
  .then(() => {
    console.log("Connexion à la base de données (Supmap-itinerarydb) réussie.");
    return sequelize.sync();
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Itinerary-service en HTTP sur http://localhost:${PORT}`);
    });
    
  })
  .catch(err => {
    console.error("Erreur de connexion à la base de données :", err);
  });
