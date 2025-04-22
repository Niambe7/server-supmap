// user-service/server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const sequelize = require('./config/db');
const userRoutes = require('./routes/userRoutes');
const locationRoutes = require('./routes/locationRoutes');
const authMiddleware = require('./middleware/authMiddleware');

dotenv.config();
const app = express();

// 1) Trust proxy pour accepter X-Forwarded-* si besoin
app.set('trust proxy', true);

// 2) Logger TOUTES les requêtes et headers reçus
app.use((req, res, next) => {
  console.log('\n[User-Service] ▶ Requête entrante :', req.method, req.originalUrl);
  console.log('[User-Service] --- req.headers ---');
  console.dir(req.headers, { depth: 1 });
  console.log('[User-Service] --- req.rawHeaders ---', req.rawHeaders);
  next();
});

// 3) Middleware de blocage : n’autoriser que si X-From-Gateway === 'true'
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    console.log('[User-Service]   ↳ OPTIONS detected, skipping gateway check');
    return next();
  }
  const fromGw = req.headers['x-from-gateway'];
  console.log('[User-Service]   ↳ Valeur x-from-gateway:', fromGw);
  if (fromGw == 'true') {
    console.warn('[User-Service] ⚠️ Accès direct interdit');
    return res.status(403).send('Accès direct interdit');
  }
  next();
});

// 4) CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-From-Gateway']
}));

// 5) Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 6) Logging succinct des routes atteintes
app.use((req, res, next) => {
  console.log(`[User-Service] ◆ Handler routing to ${req.method} ${req.originalUrl}`);
  next();
});

// 7) Montages des routes
app.use('/users', userRoutes);
app.use('/location', authMiddleware, locationRoutes);

// 8) 404 catch‑all
app.use((req, res) => {
  console.warn(`[User-Service] 404 pour ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    status: 'error',
    message: 'Endpoint non trouvé',
    path: req.originalUrl
  });
});

// 9) Error handler général
app.use((err, req, res, next) => {
  console.error('[User-Service] [ERROR]', err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Erreur interne',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 10) Démarrage du serveur et connexion DB
const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('[User-Service] Connexion à PostgreSQL réussie.');

    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('[User-Service] Modèles synchronisés avec la BDD');
    }

    const PORT = process.env.PORT || 7001;
    app.listen(PORT, () => {
      console.log(`[User-Service] En écoute sur http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[User-Service] Erreur de démarrage:', err);
    process.exit(1);
  }
};

startServer();
