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

app.post('/statistics/congestion-periods', async (req, res) => {
  const threshold = 5;                          // seuil fixe
  const { lat, lng, radius = 1000 } = req.body; // on lit dans le body

  const latitude  = parseFloat(lat);
  const longitude = parseFloat(lng);
  if (isNaN(latitude) || isNaN(longitude)) {
    return res.status(400).json({ error: "lat et lng doivent être des nombres." });
  }

  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();

    // 1) Récupération des incidents de type "traffic"
    const { rows } = await client.query(`
      SELECT incident_id, created_at, latitude, longitude
      FROM incident_statistics
      WHERE type = 'traffic'
    `);

    // 2) Filtrage géographique
    const nearby = rows.filter(r =>
      haversineDistance(latitude, longitude, r.latitude, r.longitude) <= radius
    );

    // 3) Agrégation horaire
    const buckets = {};
    nearby.forEach(({ created_at }) => {
      const dt  = new Date(created_at);
      const key = dt.toISOString().slice(0, 13) + ":00:00Z";
      buckets[key] = (buckets[key] || 0) + 1;
    });

    // 4) Sélection des créneaux ≥ seuil
    const result = Object.entries(buckets)
      .filter(([, count]) => count >= threshold)
      .map(([period_start, traffic_incident_count]) => ({
        period_start,
        traffic_incident_count
      }))
      .sort((a, b) => a.period_start.localeCompare(b.period_start));

    return res.json(result);

  } catch (err) {
    console.error("[Statistics Service] Erreur /congestion-periods :", err.message);
    return res.status(500).json({ error: "Impossible de récupérer les périodes de congestion." });
  } finally {
    await client.end();
  }
});


// Endpoint de test
app.get('/', (req, res) => res.send('Statistics Service opérationnel'));

const PORT = process.env.PORT || 7006;

app.listen(PORT, () => {
  console.log(`Statistics-service en HTTP sur http://localhost:${PORT}`);
});
