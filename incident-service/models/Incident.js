const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Incident = sequelize.define('Incident', {
    type: {
      type: DataTypes.ENUM(
        'accident',    // Pour "Accidents"
        'traffic',     // Pour "Embouteillages"
        'closed',      // Pour "Routes fermées"
        'police',      // Pour "Contrôles policiers"
        'obstacle'     // Pour "Obstacles sur la route"
      ),
      allowNull: false,
    },
  latitude: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  longitude: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: ''
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'pending'
  },
  approvedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  approvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  resolvedAt: {  // Nouvelle colonne
    type: DataTypes.DATE,
    allowNull: true,
  },
  resolvedBy: {  // Optionnel, pour enregistrer l'ID de l'admin qui a résolu l'incident
    type: DataTypes.INTEGER,
    allowNull: true,
  }
}, {
  tableName: 'incidents',
  timestamps: true
});

module.exports = Incident;
