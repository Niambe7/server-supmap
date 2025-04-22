const express = require('express');
const router = express.Router();
const axios = require('axios'); // Pour appeler le Notification Service
const Incident = require('../../incident-service/models/Incident'); // Modèle Incident

const haversineDistance = (coord1, coord2) => {
  // Coordonnées sous forme d'objet { lat, lng }
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371e3; // Rayon de la Terre en mètres
  const φ1 = toRad(coord1.lat);
  const φ2 = toRad(coord2.lat);
  const Δφ = toRad(coord2.lat - coord1.lat);
  const Δλ = toRad(coord2.lng - coord1.lng);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance en mètres
};

// Middleware d'authentification déjà appliqué (pour avoir req.user)

router.post('/update', async (req, res) => {
  const { latitude, longitude } = req.body;
  const userId = req.user.id;

  if (!latitude || !longitude) {
    return res.status(400).json({ error: "Les champs 'latitude' et 'longitude' sont requis" });
  }

  try {
    // Récupérer les incidents actifs
    const incidents = await Incident.findAll({ where: { status: 'active' } });
    const userCoords = { lat: parseFloat(latitude), lng: parseFloat(longitude) };

    // Vérifier la proximité pour chaque incident
    for (const incident of incidents) {
      const incidentCoords = { lat: incident.latitude, lng: incident.longitude };
      const distance = haversineDistance(incidentCoords, userCoords);

      if (distance <= 300) {
        // Appeler le Notification Service pour envoyer une notification à cet utilisateur
        // Par exemple, en effectuant une requête POST vers le Notification Service
        await axios.post('http://localhost/notify/notify-contibute', { 
          message: `Attention, un incident de type "${incident.type}" a été signalé à proximité.`,
          data: { incidentId: incident.id, distance }
        }, {
          headers: { Authorization: req.headers.authorization }
        });
        // On peut décider d'arrêter la vérification après la première notification, 
        // ou cumuler les notifications si plusieurs incidents se trouvent à proximité.
      }
    }

    res.status(200).json({ message: "Mise à jour de position traitée" });
  } catch (error) {
    console.error("Erreur lors de la mise à jour de position:", error.message);
    res.status(500).json({ error: "Erreur lors de la mise à jour de position" });
  }
});

module.exports = router;
