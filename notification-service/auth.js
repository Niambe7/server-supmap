// notification-service/auth.js

const jwt = require('jsonwebtoken');

module.exports.verifyToken = async (authHeader) => {
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  // Expected format : "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new Error('Malformed Authorization header');
  }
  const token = parts[1];

  try {
    // VALEUR DU SECRET définie dans ton .env (ex: JWT_SECRET=maCleSuperSecrete)
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload; // contient les infos user (ex. payload.id, payload.email…)
  } catch (err) {
    throw new Error('Invalid token');
  }
};
