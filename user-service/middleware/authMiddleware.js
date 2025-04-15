// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'cb4b5e26288367358ababfb163778896a17a0e9c0e039ac9ca33cb20cccb8531';

/**
 * Middleware de vérification de token.
 * Si l'option adminRequired est activée, vérifie que le token contient { role: 'admin' }.
 *
 * @param {object} options - Options facultatives.
 * @param {boolean} options.adminRequired - Indique si l'accès admin est requis.
 * @returns {function} Le middleware Express.
 */
module.exports = (options = {}) => {
  const { adminRequired = false } = options;
  
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token manquant ou invalide' });
    }
    const token = authHeader.split(' ')[1];
    try {
      // Décode le token
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded; // Exemple : { id: 1, role: 'admin', ... }
      
      // Si l'accès admin est requis, vérifier le rôle de l'utilisateur
      if (adminRequired && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Accès refusé. Vous devez être administrateur pour effectuer cette action.' });
      }
      
      next();
    } catch (err) {
      console.error("Erreur lors du décodage du token :", err);
      return res.status(401).json({ error: 'Token invalide' });
    }
  };
};
