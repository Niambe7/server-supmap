// controllers/userController.js
const bcrypt = require('bcrypt');
const User = require('../models/userModel');

const saltRounds = 10;

exports.createUser = async (req, res) => {
  try {
    // Lire les données envoyées, y compris le rôle s'il est présent
    const { username, email, password, role } = req.body;
    
    // Chiffrer le mot de passe
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Créer l'utilisateur en passant le rôle fourni ou par défaut "user"
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
      role: role ? role : 'user'
    });
    
    res.status(201).json({
      message: "Utilisateur créé avec succès",
      user: newUser
    });
  } catch (err) {
    console.error('[UserController] Erreur dans createUser:', err);
    res.status(500).json({ error: "Erreur lors de la création de l'utilisateur" });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll();
    res.status(200).json(users);
  } catch (err) {
    console.error('[UserController] Erreur dans getAllUsers:', err);
    res.status(500).json({ error: "Erreur lors de la récupération des utilisateurs" });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    res.status(200).json(user);
  } catch (err) {
    console.error('[UserController] Erreur dans getUserById:', err);
    res.status(500).json({ error: "Erreur lors de la récupération de l'utilisateur" });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    
    // Pour éviter de mettre à jour le rôle par inadvertance, vous pouvez choisir ici de ne pas le modifier.
    const updateData = req.body;
    // Optionnel : si vous souhaitez autoriser la mise à jour du rôle, vérifiez que c'est autorisé.
    await user.update(updateData);
    res.status(200).json({ message: 'Utilisateur mis à jour avec succès', user });
  } catch (err) {
    console.error('[UserController] Erreur dans updateUser:', err);
    res.status(500).json({ error: "Erreur lors de la mise à jour de l'utilisateur" });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    await user.destroy();
    res.status(200).json({ message: 'Utilisateur supprimé avec succès' });
  } catch (err) {
    console.error('[UserController] Erreur dans deleteUser:', err);
    res.status(500).json({ error: "Erreur lors de la suppression de l'utilisateur" });
  }
};
