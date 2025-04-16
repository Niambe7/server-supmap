const https = require('https');
const fs = require('fs');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const dotenv = require('dotenv');
dotenv.config();

const app = express();

app.use((req, res, next) => {
  console.log(`[API Gateway] Requête reçue: ${req.method} ${req.url}`);
  next();
});

// Proxy pour authentification : pas de préfixe additionnel
app.use('/auth', createProxyMiddleware({
  target: 'https://localhost:7002',
  changeOrigin: true,
  secure: false,
}));

// proxy pour le user-service 
app.use('/users', createProxyMiddleware({
  target: 'https://localhost:7001',
  changeOrigin: true,
  secure: false,
}));

// Endpont pour la recherche d'itineraires
app.use('/itineraries', createProxyMiddleware({
  target: 'https://localhost:7003',
  changeOrigin: true,
  secure: false
}));


// Endpont pour le signalement d'incident
app.use('/incidents', createProxyMiddleware({
  target: 'https://localhost:7004',
  changeOrigin: true,
  secure: false
}));

// sera proxyfiée vers votre Notification Service
app.use('/notify', createProxyMiddleware({
  target: 'https://localhost:7005',
  changeOrigin: true,
  secure: false
}));


// sera proxyfiée vers votre Notification Service
app.use('/statistics', createProxyMiddleware({
  target: 'https://localhost:7006',
  changeOrigin: true,
  secure: false
}));

// Route test
app.get('/', (req, res) => {
  res.send('API Gateway opérationnelle');
});

const PORT = process.env.PORT || 443;
const key = fs.readFileSync('gateway.key');
const cert = fs.readFileSync('gateway.crt');
https.createServer({ key, cert }, app).listen(PORT, () => {
  console.log(`API Gateway est en écoute en HTTPS sur le port ${PORT}`);
});
