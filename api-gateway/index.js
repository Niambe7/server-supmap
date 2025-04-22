// api-gateway/index.js
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
// Si derrière un tunnel (Cloudflare, ngrok…)
app.set('trust proxy', true);

// 1) Log de chaque requête entrante
app.use((req, res, next) => {
  console.log(`\n[API-Gateway] ▶ Requête reçue : ${req.method} ${req.originalUrl}`);
  next();
});

/**
 * Crée et attache un proxy pour un chemin donné
 * @param {string} mount   Le chemin monté (ex: '/users')
 * @param {string} target  L'URL du service en amont (ex: 'http://localhost:7001')
 */
function mountProxy(mount, target) {
  app.use(mount, createProxyMiddleware({
    target,
    changeOrigin: true,
    secure: false,
    pathRewrite:null,
    logLevel: 'debug',                   // Active les logs internes
    onProxyReq: (proxyReq, req) => {
      console.log(`[API-Gateway]   ↳ inject X-From-Gateway on ${req.method} ${req.originalUrl}`);
      proxyReq.setHeader('X-From-Gateway', 'true');
    },
    onProxyRes: (proxyRes, req) => {
      console.log(`[API-Gateway]   ↳ upstream ${req.method} ${req.originalUrl} → ${proxyRes.statusCode}`);
    },
    onError: (err, req, res) => {
      console.error(`[API-Gateway] ❌ erreur proxy ${req.method} ${req.originalUrl}:`, err.message);
      res.status(502).send('Bad Gateway');
    }
  }));
}

// 2) Montez vos services
mountProxy('/auth',        'http://localhost:7002');
mountProxy('/users',       'http://localhost:7001');
mountProxy('/itineraries', 'http://localhost:7003');
mountProxy('/incidents',   'http://localhost:7004');
mountProxy('/notify',      'http://localhost:7005');
mountProxy('/statistics',  'http://localhost:7006');

// 3) Route racine
app.get('/', (req, res) => {
  res.send('API Gateway opérationnelle');
});

// 4) 404 catch‑all
app.use((req, res) => {
  console.warn(`[API-Gateway] 404 : ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Not Found' });
});

// 5) Démarrage
const PORT = process.env.PORT || 7777;
app.listen(PORT, () => {
  console.log(`[API-Gateway] en écoute sur http://localhost:${PORT}`);
});
