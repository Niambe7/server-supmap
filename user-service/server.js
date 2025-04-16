const https = require('https');
const fs = require('fs');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const sequelize = require('./config/db');
const userRoutes = require('./routes/userRoutes');
const locationRoutes = require('./routes/locationRoutes');

// Configuration de l'environnement
dotenv.config();

// Initialisation de l'application Express
const app = express();


// Ajoutez ce middleware en premier :
app.use((req, res, next) => {
  if (req.headers['x-forwarded-for']) {
    return res.status(403).send('Accès direct interdit');
  }
  next();
});
// Middlewares globaux
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware de logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});



// Montage des routes
app.use('/users', userRoutes);
app.use('/location', authMiddleware, locationRoutes);
// Gestion des erreurs 404
app.use((req, res, next) => {
  res.status(404).json({ 
    status: 'error',
    message: 'Endpoint non trouvé',
    path: req.originalUrl
  });
});

// Middleware de gestion des erreurs globales
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Erreur interne du serveur',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Connexion à PostgreSQL et démarrage du serveur
const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('Connexion à PostgreSQL réussie.');

    // Synchronisation des modèles (à adapter selon votre besoin)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('Modèles synchronisés avec la base de données');
    }

    // Configuration HTTPS
    const sslOptions = {
      key: fs.readFileSync('localhost-key.pem'),
      cert: fs.readFileSync('localhost.pem'),
      minVersion: 'TLSv1.2'
    };

    const PORT = process.env.PORT || 7001;
    const server = https.createServer(sslOptions, app);

    server.listen(PORT, () => {
      console.log(`User-service en écoute sur https://localhost:${PORT}`);
      console.log(`Environnement: ${process.env.NODE_ENV || 'development'}`);
    });

    // Gestion propre des arrêts
    process.on('SIGTERM', () => {
      console.log('Fermeture du serveur...');
      server.close(() => {
        sequelize.close();
        console.log('Serveur et connexion DB fermés');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Erreur de démarrage:', error);
    process.exit(1);
  }
};

startServer();