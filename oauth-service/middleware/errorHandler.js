// src/middleware/errorHandler.js
module.exports = (err, req, res, next) => {
    res.status(err.status || 500).json({
      error: err.message || 'Erreur interne du serveur'
    });
  };
  