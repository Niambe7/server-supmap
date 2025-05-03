// incident-service/controllers/incidentController.js
const { Sequelize } = require('sequelize');
const axios = require('axios');                       // ← Import d'axios
const { Incident, IncidentContribution } = require('../models');

// Calcul de la distance entre deux points GPS
const haversineDistance = (coord1, coord2) => {
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

  return R * c;
};

// Signaler un incident
const reportIncident = async (req, res) => {
  const { type, latitude, longitude, description } = req.body;
  const user_id = req.user.id;

  if (!type || !latitude || !longitude || !user_id) {
    return res.status(400).json({
      error: "Les champs 'type', 'latitude', 'longitude' et 'user_id' sont requis."
    });
  }

  try {
    const incident = await Incident.create({
      type,
      latitude,
      longitude,
      description: description || '',
      user_id,
      status: 'pending'
    });

    return res.status(201).json({
      message: "Incident signalé avec succès",
      incident
    });
  } catch (error) {
    console.error("Erreur lors du signalement de l'incident :", error.message);
    return res.status(500).json({ error: "Erreur lors du signalement de l'incident." });
  }
};

// Approuver un incident et envoyer notification
const approveIncident = async (req, res) => {
  const incidentId = req.params.id;

  try {
    const incident = await Incident.findByPk(incidentId);
    if (!incident) {
      return res.status(404).json({ error: 'Incident non trouvé.' });
    }

    incident.status     = 'active';
    incident.approvedBy = req.user.id;
    incident.approvedAt = new Date();
    await incident.save();

    let message;
    switch (incident.type) {
      case 'police':
        message = 'Attention, contrôle policier sur votre route dans 3 km !';
        break;
      case 'accident':
        message = 'Attention, un accident a été signalé sur votre itinéraire.';
        break;
      case 'traffic':
        message = 'Attention, embouteillage sur votre route.';
        break;
      case 'closed':
        message = 'Attention, route fermée sur votre itinéraire.';
        break;
      case 'obstacle':
        message = 'Attention, un obstacle a été signalé sur votre trajet.';
        break;
      default:
        message = 'Un incident a été signalé sur votre route.';
    }

    // Appel au Notification Service
    const notifyUrl = process.env.NOTIFICATION_URL
      || 'https://api.supmap-server.pp.ua/notify/notify-changeway';
    await axios.post(notifyUrl, {
      message,
      data: { incidentId: incident.id, type: incident.type }
    });

    return res.status(200).json({
      message: 'Incident approuvé avec succès',
      incident
    });
  } catch (error) {
    console.error("Erreur lors de l'approbation de l'incident :", error.message);
    return res.status(500).json({ error: "Erreur lors de l'approbation de l'incident." });
  }
};

// Résoudre (lever) un incident
const resolveIncident = async (req, res) => {
  const incidentId = req.params.id;

  try {
    const incident = await Incident.findByPk(incidentId);
    if (!incident) {
      return res.status(404).json({ error: 'Incident non trouvé.' });
    }

    incident.status     = 'resolved';
    incident.resolvedAt = new Date();
    incident.resolvedBy = req.user.id;
    await incident.save();

    return res.status(200).json({
      message: 'Incident résolu avec succès',
      incident
    });
  } catch (error) {
    console.error("Erreur lors de la résolution de l'incident :", error.message);
    return res.status(500).json({ error: "Erreur lors de la résolution de l'incident." });
  }
};

// Contribuer à l'évaluation d'un incident
const contributeIncident = async (req, res) => {
  const incidentId = req.params.id;
  const { vote, latitude, longitude } = req.body;
  const user_id = req.user.id;

  if (!vote || (vote !== 'yes' && vote !== 'no') || !latitude || !longitude) {
    return res.status(400).json({
      error: "Les champs 'vote', 'latitude' et 'longitude' sont requis, et 'vote' doit être 'yes' ou 'no'."
    });
  }

  try {
    const incident = await Incident.findByPk(incidentId);
    if (!incident) {
      return res.status(404).json({ error: 'Incident non trouvé.' });
    }
    if (incident.user_id === user_id) {
      return res.status(403).json({
        error: "Vous ne pouvez pas contribuer à un incident que vous avez signalé."
      });
    }

    const incidentCoordinates = { lat: incident.latitude, lng: incident.longitude };
    const userCoordinates     = { lat: parseFloat(latitude), lng: parseFloat(longitude) };
    const distance = haversineDistance(incidentCoordinates, userCoordinates);
    const maxDistance = 300;

    if (distance > maxDistance) {
      return res.status(403).json({
        error: "Vous n'êtes pas assez proche de l'incident pour contribuer."
      });
    }

    const contribution = await IncidentContribution.create({
      incident_id: incidentId,
      user_id,
      vote,
      latitude: userCoordinates.lat,
      longitude: userCoordinates.lng
    });

    return res.status(201).json({
      message: 'Contribution enregistrée avec succès',
      contribution
    });
  } catch (error) {
    console.error("Erreur lors de l'enregistrement de la contribution :", error.message);
    return res.status(500).json({
      error: "Erreur lors de l'enregistrement de la contribution."
    });
  }
};

/**
 * Récupère le tout premier incident en statut "pending",
 * avec le nombre de votes "yes" pour les contributions associées.
 */
const getFirstPendingIncident = async (req, res) => {
  try {
    // 1) Récupérer le tout premier incident en status "pending"
    const incident = await Incident.findOne({
      where: { status: 'pending' },
      order: [['id', 'ASC']],
    });

    // 2) Si aucun incident, renvoyer 404
    if (!incident) {
      return res.status(404).json({ error: 'Aucun incident pending trouvé.' });
    }

    // 3) Sinon, renvoyer l’incident
    return res.status(200).json({ incident });
  } catch (err) {
    console.error('Erreur getFirstPendingIncident:', err);
    return res
      .status(500)
      .json({ error: 'Erreur interne lors de la récupération de l’incident.' });
  }
};


// Récupérer les incidents avec statut 'pending'
const getPendingIncidents = async (req, res) => {
  try {
    const incidents = await Incident.findAll({
      where: { status: 'pending' },
      include: [
        {
          model: IncidentContribution,
          attributes: [],
          where: { vote: 'yes' },
          required: false
        }
      ],
      attributes: {
        include: [
          [Sequelize.fn('COUNT', Sequelize.col('IncidentContributions.id')), 'yesVotes']
        ]
      },
      group: ['Incident.id'],
      order: [['id', 'ASC']]
    });

    return res.status(200).json({ incidents });
  } catch (error) {
    console.error("Erreur lors de la récupération des incidents pending :", error.message);
    return res.status(500).json({ error: "Erreur lors de la récupération des incidents pending." });
  }
};

// Récupérer les incidents avec statut 'active'
const getActiveIncidents = async (req, res) => {
  try {
    const incidents = await Incident.findAll({
      where: { status: 'active' }
    });
    return res.status(200).json({ incidents });
  } catch (error) {
    console.error("Erreur lors de la récupération des incidents active :", error.message);
    return res.status(500).json({ error: "Erreur lors de la récupération des incidents active." });
  }
};

// Récupérer les incidents avec statut 'resolved'
const getResolvedIncidents = async (req, res) => {
  try {
    const incidents = await Incident.findAll({
      where: { status: 'resolved' }
    });
    return res.status(200).json({ incidents });
  } catch (error) {
    console.error("Erreur lors de la récupération des incidents resolved :", error.message);
    return res.status(500).json({ error: "Erreur lors de la récupération des incidents resolved." });
  }
};


module.exports = {
  reportIncident,
  approveIncident,
  resolveIncident,
  contributeIncident,
  haversineDistance,
  getPendingIncidents,
  getResolvedIncidents,
  getActiveIncidents,
  getFirstPendingIncident
};
