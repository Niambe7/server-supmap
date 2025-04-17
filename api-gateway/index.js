// api-gateway/index.js
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const dotenv = require('dotenv');

dotenv.config();
const app = express();

// Si vous passez derrière ngrok ou un autre proxy
app.set('trust proxy', true);

// Logging de chaque requête
app.use((req, res, next) => {
  console.log(`[API Gateway] ${req.method} ${req.url}`);
  next();
});

// Proxy vers l'auth-service (HTTP)
app.use('/auth', createProxyMiddleware({
  target: 'http://localhost:7002',
  changeOrigin: true
}));

// Proxy vers le user-service
app.use('/users', createProxyMiddleware({
  target: 'http://localhost:7001',
  changeOrigin: true
}));

// Proxy vers l'itinerary-service
app.use('/itineraries', createProxyMiddleware({
  target: 'http://localhost:7003',
  changeOrigin: true
}));

// Proxy vers l'incident-service
app.use('/incidents', createProxyMiddleware({
  target: 'http://localhost:7004',
  changeOrigin: true
}));

// Proxy vers le notification-service
app.use('/notify', createProxyMiddleware({
  target: 'http://localhost:7005',
  changeOrigin: true
}));

// Proxy vers le statistics-service
app.use('/statistics', createProxyMiddleware({
  target: 'http://localhost:7006',
  changeOrigin: true
}));

// Route de test
app.get('/', (req, res) => {
  res.send('API Gateway opérationnelle (HTTP)');
});

// Démarrage en HTTP
const PORT = process.env.PORT || 7777;
app.listen(PORT, () => {
  console.log(`API Gateway en HTTP sur http://localhost:${PORT}`);
});
