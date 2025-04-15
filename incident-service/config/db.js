// incident-service/config/db.js
const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');
dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false, // mettez à true si vous souhaitez voir les requêtes SQL
});

module.exports = sequelize;
