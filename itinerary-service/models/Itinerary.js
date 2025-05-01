// itinerary-service/models/Itinerary.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Itinerary = sequelize.define('Itinerary', {
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  start_location: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  end_location: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  route_points: {
    type: DataTypes.JSONB,    // Stockage des points de parcours
    allowNull: false,
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  distance: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  cost: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  toll_free: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  steps: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: []
  },
}, {
  tableName: 'itineraries', // Nom de la table dans la base
  timestamps: true,
});

module.exports = Itinerary;
