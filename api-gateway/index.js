// api-gateway/index.js

const express = require('express');
const http = require('http');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// 1) Trust proxy (Cloudflare / ngrok…)
app.set('trust proxy', true);

// 2) Log de chaque requête entrante
app.use((req, res, next) => {
  console.log(`[API-Gateway] ▶ ${req.method} ${req.originalUrl}`);
  next();
});

// Helper pour monter un proxy
function mountProxy(mountPath, target, { ws = false, pathRewrite = null } = {}) {
  const proxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    secure: false,
    ws,
    pathRewrite,
    logLevel: 'debug',
    onProxyReq: (proxyReq, req) => {
      proxyReq.setHeader('X-From-Gateway', 'true');
    },
    onProxyRes: (proxyRes, req) => {
      console.log(`[API-Gateway]   ↳ upstream ${req.method} ${req.originalUrl} → ${proxyRes.statusCode}`);
    },
    onError: (err, req, res) => {
      console.error(`[API-Gateway] ❌ proxy error ${req.method} ${req.originalUrl}:`, err.message);
      if (!res.headersSent) res.status(502).send('Bad Gateway');
    },
  });
  app.use(mountPath, proxy);
  return proxy;
}

// 3) Monte les autres services HTTP
mountProxy('/auth',        'http://localhost:7002');
mountProxy('/users',       'http://localhost:7001');
mountProxy('/itineraries', 'http://localhost:7003');
mountProxy('/incidents',   'http://localhost:7004');
mountProxy('/statistics',  'http://localhost:7006');

// 4) Monte le service de notification (HTTP + WS)
//    - toutes les requêtes /notify/* → localhost:7005/*
//    - /notify/socket.io/* → /socket.io/* côté notif-service
const notifyProxy = mountProxy(
  '/notify',
  'http://localhost:7005',
  {
    ws: true,
    pathRewrite: {
      '^/notify/socket.io': '/socket.io',
      '^/notify': ''
    }
  }
);

// 5) Route racine & 404
app.get('/', (req, res) => res.send('API Gateway opérationnelle'));
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));

// 6) Démarrage du serveur HTTP + WS Upgrade
const PORT = process.env.PORT || 7777;
const server = http.createServer(app);

// Interception des WebSocket upgrades pour /notify
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/notify')) {
    notifyProxy.upgrade(req, socket, head);
  }
});

server.listen(PORT, () => {
  console.log(`[API-Gateway] en écoute sur http://localhost:${PORT}`);
});
