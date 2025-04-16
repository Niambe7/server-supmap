// notification-service/server.js
const express = require('express');
const cors = require('cors');
const https = require('https');
const socketIo = require('socket.io');
const dotenv = require('dotenv');
const fs = require('fs');
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const key = fs.readFileSync('notification-service.key');
const cert = fs.readFileSync('notification-service.crt');
const server = https.createServer({ key, cert }, app);

// Initialisation de Socket.IO sur le serveur HTTP
const io = socketIo(server, {
  cors: {
    origin: "*", // pour simplifier en dev, mais restreignez en prod
    methods: ["GET", "POST"]
  }
});

  // Quand un client se connecte
  io.on('connection', (socket) => {
    console.log(`[Notification Service] Client connecté: ${socket.id}`);
    socket.on('disconnect', () => {
      console.log(`[Notification Service] Client déconnecté: ${socket.id}`);
    });
  });
  
  // Endpoint REST pour tester l'envoi d'une notification
  app.post('/notify-changeway', (req, res) => {
    const { message, data } = req.body;
    console.log(`[Notification Service] Envoi d'une notification: ${message}`, data);
    io.emit('notification', { message, data }); // Diffuse à tous les clients connectés
    res.json({ status: 'Notification envoyée' });
  });

  app.post('/notify-contibute', (req, res) => {
    const { message, data } = req.body;
    console.log(`[Notification Service] Envoi d'une notification: ${message}`, data);
    io.emit('notification', { message, data }); // Diffuse à tous les clients connectés
    res.json({ status: 'Notification envoyée' });
  });

  app.post('/test-notification', (req, res) => {
    const { message, data } = req.body;
    console.log(`[Notification Service] Envoi de notification de test : ${message}`, data);
    io.emit('notification', { message, data });
    res.json({ status: 'Notification envoyée' });
  });
  
  // Route de test pour vérifier le fonctionnement du service
  app.get('/', (req, res) => {
    res.send('Notification Service opérationnel');
  });
  
  // Démarrage du serveur
  const PORT = process.env.PORT || 7005;
  server.listen(PORT, () => {
    console.log(`[Notification Service] En écoute sur le port ${PORT}`);
  });