// statistics-service/server.js
const https = require('https');
const fs = require('fs');
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { Client } = require('pg');
const cron = require('node-cron');


function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // rayon de la Terre en mètres
    const toRad = degrees => degrees * Math.PI / 180;
  
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1);
    const Δλ = toRad(lon2 - lon1);
  
    const sinΔφ2 = Math.sin(Δφ / 2);
    const sinΔλ2 = Math.sin(Δλ / 2);
  
    const a = sinΔφ2 * sinΔφ2 +
              Math.cos(φ1) * Math.cos(φ2) *
              sinΔλ2 * sinΔλ2;
  
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
    return R * c;
  }

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



// Endpoint de debug et filtrage spatial + agrégation temporelle
app.get('/statistics/congestion-periods', async (req, res) => {
    const threshold = parseInt(req.query.threshold, 10) || 5;
    const window   = req.query.window === '30min' ? '30min' : 'hour';
    const lat      = parseFloat(req.query.lat);
    const lng      = parseFloat(req.query.lng);
    const radius   = parseInt(req.query.radius, 10) || 1000;
  
    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: "lat et lng doivent être des nombres." });
    }
  
    const client = new Client({ connectionString: DATABASE_URL });
    try {
      await client.connect();
  
      // 1) Récupération brute des incidents traffic
      const { rows } = await client.query(`
        SELECT incident_id, created_at, latitude, longitude
        FROM incident_statistics
        WHERE type = 'traffic'
      `);
    //   console.log("[DEBUG] total traffic rows:", rows.length);
    //   console.log("[DEBUG] point de référence:", lat, lng, "radius:", radius, "threshold:", threshold);
  
      // 2) Log des distances
      rows.forEach(r => {
        const d = haversineDistance(lat, lng, r.latitude, r.longitude);
        // console.log(`  [DEBUG] id=${r.incident_id} @(${r.latitude},${r.longitude}) → ${d.toFixed(1)} m`);
      });
  
      // 3) Filtrage géographique
      const nearby = rows.filter(r =>
        haversineDistance(lat, lng, r.latitude, r.longitude) <= radius
      );
    //   console.log("[DEBUG] rows within radius:", nearby.length);
  
      // 4) Agrégation temporelle
      const buckets = {};
      nearby.forEach(({ created_at }) => {
        const dt = new Date(created_at);
        let key;
        if (window === 'hour') {
          key = dt.toISOString().slice(0,13) + ":00:00Z";
        } else {
          const m = dt.getUTCMinutes();
          const slot = m < 30 ? "00" : "30";
          key = dt.toISOString().slice(0,13) + `:${slot}:00Z`;
        }
        buckets[key] = (buckets[key] || 0) + 1;
      });
    //   console.log("[DEBUG] buckets:", buckets);
  
      // 5) Filtrage par threshold
      const result = Object.entries(buckets)
        .filter(([, count]) => count >= threshold)
        .map(([period_start, traffic_incident_count]) => ({
          period_start,
          traffic_incident_count
        }))
        .sort((a,b) => a.period_start.localeCompare(b.period_start));
  
    //   console.log("[DEBUG] result periods:", result);
      res.json(result);
  
    } catch (err) {
      console.error("[Statistics Service] Erreur /congestion-periods :", err.message);
      res.status(500).json({ error: "Impossible de récupérer les périodes de congestion." });
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
