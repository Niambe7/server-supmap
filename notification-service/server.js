// notification-service/server.js

const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const dotenv = require('dotenv');
const { verifyToken } = require('./auth');

dotenv.config();

const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET; 

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

// Crée un serveur HTTP à partir de l’app Express
const server = http.createServer(app);

// Initialise Socket.IO sur le serveur HTTP
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Middleware d’authentification Socket.IO : lit le token dans handshake.auth
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Auth error: token missing'));
  try {
    const payload = jwt.verify(token, secret);
    socket.userId = payload.id;
    next();
  } catch {
    next(new Error('Auth error: Invalid token'));
  }
});

// Gestion des connexions clients
io.on('connection', socket => {
  console.log(`Client connecté: socketId=${socket.id}, userId=${socket.userId}`);
  socket.join(`user:${socket.userId}`);
  socket.on('disconnect', () => {
    console.log(`Client déconnecté: socketId=${socket.id}`);
  });
});

// Endpoint REST pour notifier un utilisateur spécifique
app.post('/notify-contribute', (req, res) => {
  const { userId, message, data } = req.body;
  io.to(`user:${userId}`).emit('notification', { message, data });
  res.json({ status: 'OK' });
});

// Endpoint REST pour notifier un utilisateur d'un recalcul d'itinéraire
app.post('/notify-recalculate', (req, res) => {
  const { userId, message, data } = req.body;

  // Émet sur la même room 'user:<userId>' un événement dédié 'recalculate-itinerary'
  io.to(`user:${userId}`).emit('recalculate-itinerary', {
    message,
    data
  });

  return res.json({ status: 'OK' });
});
// Health check
app.get('/', (req, res) => res.send('OK'));

// Démarrage du serveur
const PORT = process.env.PORT || 7005;
server.listen(PORT, () => {
  console.log(`Notification Service en écoute sur le port ${PORT}`);
});
