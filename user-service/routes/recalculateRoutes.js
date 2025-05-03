// user-service/routes/recalculateRoutes.js

const express = require('express');
const router = express.Router();
const axios = require('axios');

// URLs cross-service
const INCIDENT_SVC    = process.env.INCIDENT_SVC_URL    || 'http://localhost:7004';
const NOTIF_SVC_BASE  = process.env.NOTIF_SVC_URL      || 'https://api.supmap-server.pp.ua/notify';

// Clients Axios
const axiosIncident = axios.create({
  baseURL: INCIDENT_SVC,
  timeout: 5000,
});
const axiosNotif = axios.create({
  baseURL: NOTIF_SVC_BASE,
  timeout: 5000,
});

// In-memory store pour ne notifier chaque incident QU’UNE SEULE FOIS par user+itinerary
const notifiedRecalcMap = new Set();

// Fonction de distance Haversine (en mètres)
const haversineDistance = (c1, c2) => {
  const toRad = x => x * Math.PI / 180;
  const R = 6_371_000;
  const dLat = toRad(c2.lat - c1.lat);
  const dLng = toRad(c2.lng - c1.lng);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(c1.lat)) * Math.cos(toRad(c2.lat)) *
            Math.sin(dLng/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

/**
 * POST /itinerary/notify-recalculate
 * body: { userId, itineraryId, latitude, longitude }
 * -> récupère les incidents actifs, trouve le 1er à ≤ 300 m et envoie une notif de recalcul
 */
router.post('/itinerary/notify-recalculate', async (req, res) => {
  const { userId: bodyUserId, itineraryId, latitude, longitude } = req.body;
  const userId = req.user?.id || bodyUserId;

  console.log(`▶️ [notify-recalculate] Requête reçue: userId=${userId}, itineraryId=${itineraryId}, coords=(${latitude},${longitude})`);

  // 1) Validation
  if (!userId || !itineraryId) {
    console.log('❗ Champs manquants');
    return res.status(400).json({ error: "Champs 'userId' et 'itineraryId' requis." });
  }
  if (latitude == null || longitude == null) {
    console.log('❗ Coordonnées manquantes');
    return res.status(400).json({ error: "Champs 'latitude' et 'longitude' requis." });
  }

  try {
    // 2) Récupérer tous les incidents actifs pour recalcul
    const resp = await axiosIncident.get(
      '/incidents/getincdentactiverecalcul',
      { headers: { Authorization: req.headers.authorization } }
    );
    let incidents = Array.isArray(resp.data)
      ? resp.data
      : Array.isArray(resp.data.incidents)
        ? resp.data.incidents
        : [];
    console.log(`▶️ [notify-recalculate] Incidents actifs reçus: ${incidents.length}`);
    incidents.forEach(inc => {
      console.log(`   • incident ${inc.id} type=${inc.type} status=${inc.status}`);
    });

    if (!incidents.length) {
      console.log('ℹ️ Aucun incident actif');
      return res.status(200).json({ message: 'Aucun incident actif.' });
    }

    // 3) Chercher le premier incident à ≤ 300 m de l’utilisateur
    const userCoords = { lat: parseFloat(latitude), lng: parseFloat(longitude) };
    const maxDist = 300;
    let targetIncident = null;
    for (const inc of incidents) {
      const dist = haversineDistance(
        { lat: inc.latitude, lng: inc.longitude },
        userCoords
      );
      console.log(`   → distance to incident ${inc.id}: ${Math.round(dist)} m`);
      if (dist <= maxDist) {
        targetIncident = { ...inc, distance: dist };
        console.log(`✅ Incident ${inc.id} sélectionné pour notification (dist=${Math.round(dist)}m)`);
        break;
      }
    }
    if (!targetIncident) {
      console.log('ℹ️ Aucun incident à moins de 300 m');
      return res.status(200).json({ message: 'Aucun incident actif à moins de 300 m.' });
    }

    // 4) Ne pas renoter si déjà fait pour ce user+itinéraire+incident
    const key = `${userId}:${itineraryId}:${targetIncident.id}`;
    if (!notifiedRecalcMap.has(key)) {
      console.log(`▶️ Envoi notification recalcul pour clé=${key}`);
      // 5) Envoyer la notification via notification-service
      await axiosNotif.post(
        '/notify/notify-recalculate',
        {
          userId,
          message: `🚗 Un incident (${targetIncident.type}) est à ${Math.round(targetIncident.distance)} m — recalculer l’itinéraire ?`,
          data: {
            itineraryId,
            incidentId: targetIncident.id,
            distance:   targetIncident.distance
          }
        },
        { headers: { Authorization: req.headers.authorization } }
      );
      notifiedRecalcMap.add(key);
      console.log(`✅ Notif recalcul envoyée: ${key}`);
    } else {
      console.log(`ℹ️ Notif recalcul déjà envoyée auparavant: ${key}`);
    }

    return res.status(200).json({
      message: 'Position traitée, notification recalcul (si besoin) envoyée.'
    });

  } catch (err) {
    console.error('❌ Erreur notify-recalculate:', err.response?.data || err.message);
    return res.status(500).json({
      error: 'Erreur lors de la notification de recalcul.'
    });
  }
});

module.exports = router;
