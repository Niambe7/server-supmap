// incident-service/middleware/adminMiddleware.js
module.exports = (req, res, next) => {
    // On suppose que req.user a été renseigné par votre middleware d'authentification (par exemple, via JWT)
    if (req.user && req.user.role === 'admin') {
      return next();
    }
    return res.status(403).json({ error: "Accès refusé. Vous devez être administrateur pour approuver cet incident." });
  };
  