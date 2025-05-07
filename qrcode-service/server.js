// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const axios = require('axios');

const app = express();

// 1) Active CORS pour toutes origines
app.use(cors());
app.use(express.json());

// URL de ton service d'itinéraires
const ITINERARY_API = process.env.ITINERARY_API_URL
  || 'https://api.supmap-server.pp.ua/itineraries/itineraries';

app.get('/qrcode/:itineraryId', async (req, res) => {
  const { itineraryId } = req.params;

  try {
    // 1) Vérif existence via l'API itinéraire
    const check = await axios.get(`${ITINERARY_API}/${itineraryId}`);
    if (check.status !== 200) {
      return res.status(404).json({ error: 'Itinéraire non trouvé.' });
    }

    // 2) Construire le payload QR (juste l'ID)
    //    Format : "itinerary:<id>"
    const payload = `itinerary:${itineraryId}`;
    console.log(`🔗 Payload QR [${itineraryId}]:`, payload);

    // Optionnel : afficher l’ASCII du QR dans le terminal
    QRCode.toString(payload, { type: 'terminal' }, (err, ascii) => {
      if (!err) console.log(ascii);
    });

    // 3) Générer et renvoyer le QR code (image PNG)
    res.setHeader('Content-Type', 'image/png');
    await QRCode.toFileStream(res, payload, {
      width: 300,
      margin: 2,
    });

  } catch (err) {
    if (err.response && err.response.status === 404) {
      return res.status(404).json({ error: 'Itinéraire non trouvé.' });
    }
    console.error('❌ /api/qrcode/:itineraryId error', err.message);
    res.status(500).json({ error: 'Échec génération QR code.' });
  }
});

// Health check
app.get('/', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`qrcode-service sur port ${PORT}`));
