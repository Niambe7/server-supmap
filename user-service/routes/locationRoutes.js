// user-service/routes/locationRoutes.js

const express = require('express');
const router = express.Router();
const axios = require('axios');

// URL du service Incident (cross-service)
const INCIDENT_SVC   = process.env.INCIDENT_SVC_URL || 'http://localhost:7004';
// Racine du mount /notify de l’API-Gateway
const NOTIF_SVC_BASE = process.env.NOTIF_SVC_URL      || 'https://api.supmap-server.pp.ua/notify';

// Client Axios pour récupérer les incidents (timeout 5s)
const axiosIncident = axios.create({
  baseURL: INCIDENT_SVC,
  timeout: 5000,
});

// Client Axios pour envoyer les notifications (timeout 5s)
const axiosNotif = axios.create({
  baseURL: NOTIF_SVC_BASE,
  timeout: 5000,
});

/**
 * In-memory store pour garder la trace des notifications envoyées :
 * Map<userId, Set<incidentId>>
 */
const notifiedMap = new Map();

/**
 * Calcule la distance Haversine entre deux coordonnées GPS (en mètres)
 */
const haversineDistance = (coord1, coord2) => {
  const toRad = x => (x * Math.PI) / 180;
  const R = 6_371_000; // Rayon de la Terre en mètres
  const φ1 = toRad(coord1.lat);
  const φ2 = toRad(coord2.lat);
  const Δφ = toRad(coord2.lat - coord1.lat);
  const Δλ = toRad(coord2.lng - coord1.lng);

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * POST /location/update
 * - Reçoit userId, latitude & longitude
 * - Récupère tous les incidents 'pending'
 * - Calcule la distance pour chacun
 * - Sélectionne ceux à ≤ 300 m
 * - Choisit le plus proche
 * - Envoie UNE SEULE notification par incident/par user
 * - Répond immédiatement
 */
router.post('/update', async (req, res) => {
  const { latitude, longitude, userId: bodyUserId } = req.body;
  const userId = req.user?.id || bodyUserId;

  // Validation des entrées
  if (!userId) {
    return res.status(400).json({ error: "Champ 'userId' manquant." });
  }
  if (latitude == null || longitude == null) {
    return res.status(400).json({ error: "Les champs 'latitude' et 'longitude' sont requis." });
  }

  console.log(`[Update] user=${userId} coords=(${latitude},${longitude})`);

  try {
    // 1) Récupérer tous les incidents pending
    const resp = await axiosIncident.get(
      '/incidents/getincdentpending',
      { headers: { Authorization: req.headers.authorization } }
    );

    let incidents = resp.data;
    // Si la réponse est { incidents: [...] }
    if (!Array.isArray(incidents) && Array.isArray(resp.data.incidents)) {
      incidents = resp.data.incidents;
    }
    if (!Array.isArray(incidents)) {
      console.error('[Update] format inattendu pour incidents:', resp.data);
      return res.status(500).json({ error: 'Format inattendu des données incidents.' });
    }

    // 2) Calculer la distance pour chaque incident
    const userCoords = { lat: parseFloat(latitude), lng: parseFloat(longitude) };
    const withDistances = incidents.map(incident => {
      const incCoords = { lat: incident.latitude, lng: incident.longitude };
      const distance = haversineDistance(incCoords, userCoords);
      return { ...incident, distance };
    });

    // 3) Filtrer ceux à ≤ 300 m
    const nearby = withDistances.filter(i => i.distance <= 300);
    if (nearby.length === 0) {
      console.log('[Update] Aucun incident à ≤ 300 m');
      return res.status(200).json({ message: 'Aucun incident proche.' });
    }

    // 4) Choisir le plus proche (min distance)
    nearby.sort((a, b) => a.distance - b.distance);
    const nearest = nearby[0];
    console.log(`[Prox] incident=${nearest.id} distance=${Math.round(nearest.distance)}m`);

    // 5) Vérifier si on a déjà notifié cet incident pour cet utilisateur
    let notifiedSet = notifiedMap.get(userId);
    if (!notifiedSet) {
      notifiedSet = new Set();
      notifiedMap.set(userId, notifiedSet);
    }

    if (!notifiedSet.has(nearest.id)) {
      // 6) Envoyer UNE SEULE notification
      await axiosNotif.post(
        '/notify/notify-contribute',
        {
          userId,
          message: `🚨 Incident "${nearest.type}" à ${Math.round(nearest.distance)} m de vous.`,
          data: { incidentId: nearest.id, distance: nearest.distance }
        },
        { headers: { Authorization: req.headers.authorization } }
      );
      console.log(`[Notif] envoyée pour incident=${nearest.id}`);
      notifiedSet.add(nearest.id);
    } else {
      console.log(`[Notif] déjà envoyée précédemment pour incident=${nearest.id}`);
    }

    // 7) Répondre immédiatement
    return res.status(200).json({
      message: 'Position mise à jour, notification traitée pour le incident le plus proche.'
    });

  } catch (error) {
    console.error('[Update] Erreur interne:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Erreur lors de la récupération des incidents ou mise à jour de position.'
    });
  }
});

module.exports = router;
