// server.js
const app = require('./app');
const PORT = process.env.PORT || 8002;

app.listen(PORT, () => {
  console.log(`🚀 OAuth service démarré sur http://localhost:${PORT}`);
});
