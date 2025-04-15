// incident-service/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.SECRET_KEY || 'defaultsecret';

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant ou invalide' });
  }
  const token = authHeader.split(' ')[1];
  try {
    // Décodage du token : le payload doit contenir au moins l'identifiant de l'utilisateur.
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded; // Exemple: { id: 1, role: 'user' or 'admin', ... }
    next();
  } catch (err) {
    console.error("Erreur lors du décodage du token :", err);
    return res.status(401).json({ error: 'Token invalide' });
  }
};
