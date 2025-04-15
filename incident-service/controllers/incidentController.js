// incident-service/controllers/incidentController.js
const Incident = require('../models/Incident');

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
    await axios.post('https://localhost:7005/notify', { 
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


module.exports = { reportIncident , approveIncident , resolveIncident  };
