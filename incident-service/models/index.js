const Incident = require('./Incident');
const IncidentContribution = require('./IncidentContribution');

// Définir les associations ici
Incident.hasMany(IncidentContribution, { foreignKey: 'incident_id' });
IncidentContribution.belongsTo(Incident, { foreignKey: 'incident_id' });

module.exports = {
  Incident,
  IncidentContribution
};
