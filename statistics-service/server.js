// statistics-service/server.js
const https = require('https');
const fs = require('fs');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { Client } = require('pg');
const cron = require('node-cron');
const { haversineDistance } = require('../incident-service/controllers/incidentController');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const DATABASE_URL = process.env.DATABASE_URL; 
// p.ex. "postgresql://Supmap:niambe@localhost:5432/Supmap_statisticsdb"

// Met à jour la table incident_statistics avec lat/lng
const updateStatistics = async () => {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    console.log("[Statistics Service] Mise à jour des statistiques en cours...");

    const aggregationQuery = `
      WITH contribution_stats AS (
        SELECT
          incident_id,
          COUNT(*) AS contribution_count,
          SUM(CASE WHEN vote = 'yes' THEN 1 ELSE 0 END) AS yes_votes,
          SUM(CASE WHEN vote = 'no' THEN 1 ELSE 0 END) AS no_votes
        FROM dblink(
          'dbname=Supmap_incidentdb user=Supmap password=niambe host=localhost',
          'SELECT incident_id, vote FROM incident_contributions'
        ) AS ic(incident_id INTEGER, vote VARCHAR)
        GROUP BY incident_id
      ),
      incidents_data AS (
        SELECT
          id,
          type,
          status,
          "createdAt" AS created_at,
          latitude,
          longitude
        FROM dblink(
          'dbname=Supmap_incidentdb user=Supmap password=niambe host=localhost',
          'SELECT id, type, status, "createdAt", latitude, longitude FROM incidents'
        ) AS inc(id INTEGER, type VARCHAR, status VARCHAR, "createdAt" TIMESTAMP, latitude FLOAT, longitude FLOAT)
      )
      INSERT INTO incident_statistics (
        incident_id, type, status, created_at,
        latitude, longitude,
        contribution_count, yes_votes, no_votes
      )
      SELECT
        inc.id,
        inc.type,
        inc.status,
        inc.created_at,
        inc.latitude,
        inc.longitude,
        COALESCE(cs.contribution_count, 0),
        COALESCE(cs.yes_votes, 0),
        COALESCE(cs.no_votes, 0)
      FROM incidents_data inc
      LEFT JOIN contribution_stats cs
        ON inc.id = cs.incident_id
      ON CONFLICT (incident_id)
      DO UPDATE SET
        type = EXCLUDED.type,
        status = EXCLUDED.status,
        created_at = EXCLUDED.created_at,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        contribution_count = EXCLUDED.contribution_count,
        yes_votes = EXCLUDED.yes_votes,
        no_votes = EXCLUDED.no_votes;
    `;

    await client.query(aggregationQuery);
    console.log("[Statistics Service] Statistiques mises à jour.");
  } catch (err) {
    console.error("[Statistics Service] Erreur lors de la mise à jour des statistiques:", err.message);
  } finally {
    await client.end();
  }
};

// Planification du job
cron.schedule('* * * * *', () => {
  console.log("[Statistics Service] Exécution du job d'agrégation...");
  updateStatistics();
});

// Endpoint pour récupérer toutes les statistiques (avec lat/lng)
app.get('/statistics', async (req, res) => {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    const result = await client.query(`
      SELECT
        incident_id, type, status, created_at,
        latitude, longitude,
        contribution_count, yes_votes, no_votes
      FROM incident_statistics
      ORDER BY incident_id
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("[Statistics Service] Erreur GET /statistics:", err.message);
    res.status(500).json({ error: "Erreur lors de la récupération des statistiques." });
  } finally {
    await client.end();
  }
});

// Endpoint incidents-per-day
app.get('/incidents-per-day', async (req, res) => {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    const result = await client.query(`
      SELECT 
        DATE(created_at) AS report_date,
        COUNT(*) AS incident_count
      FROM incident_statistics
      GROUP BY report_date
      ORDER BY report_date
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("[Statistics Service] Erreur /incidents-per-day:", err.message);
    res.status(500).json({ error: "Erreur lors de la récupération des incidents par jour." });
  } finally {
    await client.end();
  }
});



app.get('/statistics/congestion-periods', async (req, res) => {
  const threshold = parseInt(req.query.threshold, 10) || 5;
  const window   = req.query.window === '30min' ? '30min' : 'hour';
  const lat      = parseFloat(req.query.lat);
  const lng      = parseFloat(req.query.lng);
  const radius   = parseInt(req.query.radius, 10) || 1000; // en mètres

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({
      error: "Paramètres 'lat' et 'lng' obligatoires et numériques."
    });
  }

  // 1) Récupération de tous les incidents traffic
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    const { rows } = await client.query(`
      SELECT incident_id, created_at, latitude, longitude
      FROM incident_statistics
      WHERE type = 'traffic'
    `);

    // 2) Filtrer ceux à moins de radius mètres
    const nearby = rows.filter(r => {
      return haversineDistance(lat, lng, r.latitude, r.longitude) <= radius;
    });

    // 3) Regrouper par plage de temps
    const buckets = {};
    nearby.forEach(({ created_at }) => {
      const dt = new Date(created_at);
      let key;
      if (window === 'hour') {
        key = dt.toISOString().slice(0,13) + ":00:00Z"; // ex "2025-04-15T08:00:00Z"
      } else {
        // demi‑heure
        const m = dt.getUTCMinutes();
        const slot = m < 30 ? "00" : "30";
        key = dt.toISOString().slice(0,13) + `:${slot}:00Z`;
      }
      buckets[key] = (buckets[key] || 0) + 1;
    });

    // 4) Ne garder que les buckets >= threshold
    const result = Object.entries(buckets)
      .filter(([, count]) => count >= threshold)
      .map(([period_start, traffic_incident_count]) => ({
        period_start,
        traffic_incident_count
      }))
      .sort((a,b) => a.period_start.localeCompare(b.period_start));

    res.json(result);

  } catch (err) {
    console.error("[Statistics Service] Erreur /congestion-periods JS:", err);
    res.status(500).json({
      error: "Impossible de récupérer les périodes de congestion."
    });
  } finally {
    await client.end();
  }
});


// Endpoint de test
app.get('/', (req, res) => res.send('Statistics Service opérationnel'));

// HTTPS avec mkcert
const key = fs.readFileSync('statistics-service.key');
const cert = fs.readFileSync('statistics-service.crt');
const PORT = process.env.PORT || 7006;

https.createServer({ key, cert }, app)
     .listen(PORT, () => {
  console.log(`[Statistics Service] HTTPS en écoute sur le port ${PORT}`);
});
