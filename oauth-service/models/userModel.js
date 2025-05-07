// src/models/userModel.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const User = sequelize.define('User', {
  username:   { type: DataTypes.STRING, allowNull: false, unique: true },
  email:      { type: DataTypes.STRING, allowNull: false, unique: true, validate: { isEmail: true } },
  password:   { type: DataTypes.STRING, allowNull: true },               // now nullable
  role:       { type: DataTypes.ENUM('admin','user'), allowNull: false, defaultValue: 'user' },
  googleId:   { type: DataTypes.STRING, allowNull: true, unique: true }, // new
}, {
  timestamps: true,
});

module.exports = User;
