// incident-service/controllers/incidentController.js
const Incident = require('../models/Incident');
const IncidentContribution = require('../models/IncidentContribution');

// 
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



// Signaler un incident
const reportIncident = async (req, res) => {
  // Récupérer les données depuis le body
  const { type, latitude, longitude, description } = req.body;
  // Utiliser l'ID de l'utilisateur fourni par le middleware d'authentification
  const user_id = req.user.id;

  // Vérifier les champs obligatoires
  if (!type || !latitude || !longitude || !user_id) {
    return res.status(400).json({ error: "Les champs 'type', 'latitude', 'longitude' et 'user_id' sont requis." });
  }

  try {
    // Créer l'incident dans la base
    const incident = await Incident.create({
      type,
      latitude,
      longitude,
      description: description || '',
      user_id,
      status: 'pending'
    });

    res.status(201).json({
      message: "Incident signalé avec succès",
      incident
    });
  } catch (error) {
    console.error("Erreur lors du signalement de l'incident :", error.message);
    res.status(500).json({ error: "Erreur lors du signalement de l'incident." });
  }
};

// Nouvelle fonction pour approuver un incident
const approveIncident = async (req, res) => {
    const incidentId = req.params.id; // Récupère l'ID de l'incident depuis l'URL
  
    try {
      const incident = await Incident.findByPk(incidentId);
      if (!incident) {
        return res.status(404).json({ error: 'Incident non trouvé.' });
      }
  
      // Mise à jour du statut et des champs d'approbation
      incident.status = 'active';
      incident.approvedBy = req.user.id; // L'ID de l'utilisateur admin qui approuve
      incident.approvedAt = new Date();
  
      await incident.save();

        // Préparer le message à envoyer
    let message = '';
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
  

    // Appel au Notification Service pour envoyer la notification
    await axios.post('https://localhost/notify/notify-changeway', { 
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

  

  // Fonction pour résoudre (lever) un incident
const resolveIncident = async (req, res) => {
    const incidentId = req.params.id;
  
    try {
      const incident = await Incident.findByPk(incidentId);
      if (!incident) {
        return res.status(404).json({ error: 'Incident non trouvé.' });
      }
  
      // Mettre à jour le statut pour le marquer comme résolu
      incident.status = 'resolved';
      incident.resolvedAt = new Date();
      incident.resolvedBy = req.user.id; // On suppose que le middleware d'authentification a placé l'objet utilisateur dans req.user
  
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


  // Fonction pour enregistrer une contribution sur un incident
  const contributeIncident = async (req, res) => {
    const incidentId = req.params.id;
    const { vote, latitude, longitude } = req.body;  // Position actuelle du user et vote ('yes' ou 'no')
    const user_id = req.user.id; // Renseigné par le middleware d'authentification
  
    // Vérifier que les champs obligatoires sont fournis et que vote est 'yes' ou 'no'
    if (!vote || (vote !== 'yes' && vote !== 'no') || !latitude || !longitude) {
      return res.status(400).json({ error: "Les champs 'vote', 'latitude' et 'longitude' sont requis, et 'vote' doit être 'yes' ou 'no'." });
    }
  
    try {
      // Récupérer l'incident depuis la base
      const incident = await Incident.findByPk(incidentId);
      if (!incident) {
        return res.status(404).json({ error: 'Incident non trouvé.' });
      }
  

      // Vérifier que l'utilisateur n'est pas celui qui a signalé l'incident
    if (incident.user_id === user_id) {
      return res.status(403).json({ error: "Vous ne pouvez pas contribuer à un incident que vous avez signalé." });
    }

      // Ici, on utilise les coordonnées exactes de l'incident stockées dans le modèle
      const incidentCoordinates = { lat: incident.latitude, lng: incident.longitude };
      const userCoordinates = { lat: parseFloat(latitude), lng: parseFloat(longitude) };
  
      // Calculer la distance en mètres entre l'utilisateur et l'incident
      const distance = haversineDistance(incidentCoordinates, userCoordinates);
      const maxDistance = 300; // Tolérance de 300 mètres
  
      if (distance > maxDistance) {
        return res.status(403).json({ error: "Vous n'êtes pas assez proche de l'incident pour contribuer." });
      }
  
      // Enregistrer la contribution dans la table des contributions
      const contribution = await IncidentContribution.create({
        incident_id: incidentId,
        user_id,
        vote,                    // 'yes' ou 'no'
        latitude: userCoordinates.lat,
        longitude: userCoordinates.lng
      });
  
      return res.status(201).json({
        message: 'Contribution enregistrée avec succès',
        contribution
      });
    } catch (error) {
      console.error("Erreur lors de l'enregistrement de la contribution :", error.message);
      return res.status(500).json({ error: "Erreur lors de l'enregistrement de la contribution." });
    }
  };

module.exports = { reportIncident , approveIncident , resolveIncident , contributeIncident , haversineDistance  };
