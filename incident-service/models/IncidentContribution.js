// incident-service/models/IncidentContribution.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const IncidentContribution = sequelize.define('IncidentContribution', {
  incident_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  vote: {
    type: DataTypes.ENUM('yes', 'no'),
    allowNull: false,
  },
  //pour vérifier que le votant est bien proche de l'incident
  latitude: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  longitude: {
    type: DataTypes.FLOAT,
    allowNull: true,
  }
}, {
  tableName: 'incident_contributions',
  timestamps: true
});

module.exports = IncidentContribution;
