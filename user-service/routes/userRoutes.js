// // routes/userRoutes.js
// const express = require('express');
// const router = express.Router();
// const userController = require('../controllers/userController');

// // Route pour créer un utilisateur : cela correspond à POST /users dans l'application complète
// router.post('/', userController.createUser);

// // (Vous pouvez ajouter d'autres routes ici)
// router.get('/', userController.getAllUsers);
// router.get('/:id', userController.getUserById);
// router.put('/:id', userController.updateUser);
// router.delete('/:id', userController.deleteUser);

// module.exports = router;


// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware')({ adminRequired: true });


// Middleware de debug pour ce routeur
router.use((req, res, next) => {
  console.log(`[UserRoutes] Requête reçue: ${req.method} ${req.url}`);
  console.log(`[UserRoutes] Corps: ${JSON.stringify(req.body)}`);
  next();
});

// Route pour créer un utilisateur
router.post('/', (req, res, next) => {
  console.log('[UserRoutes] Route POST "/" appelée');
  next();
}, userController.createUser);

// Autres routes avec log (optionnel)
router.get('/', (req, res, next) => {
  console.log('[UserRoutes] Route GET "/" appelée');
  next();
} , userController.getAllUsers);

router.get('/:id', (req, res, next) => {
  console.log(`[UserRoutes] Route GET "/${req.params.id}" appelée`);
  next();
}, userController.getUserById);

router.put('/:id', (req, res, next) => {
  console.log(`[UserRoutes] Route PUT "/${req.params.id}" appelée`);
  console.log(`[UserRoutes] Corps: ${JSON.stringify(req.body)}`);
  next();
}, userController.updateUser);

router.delete('/:id', (req, res, next) => {
  console.log(`[UserRoutes] Route DELETE "/${req.params.id}" appelée`);
  next();
}, authMiddleware, userController.deleteUser);

module.exports = router;
