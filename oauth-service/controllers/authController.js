// src/controllers/authController.js
const { OAuth2Client } = require('google-auth-library');
const jwt      = require('jsonwebtoken');
const User     = require('../models/userModel');
require('dotenv').config();

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.googleToken = async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'idToken manquant' });

    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const { sub: googleId, email, given_name, family_name } = ticket.getPayload();

    // findOrCreate
    let user = await User.findOne({ where: { googleId } });
    if (!user) {
      // Si email déjà existant (compte standard), on peut juste lier le googleId
      user = await User.findOne({ where: { email } });
      if (user) {
        user.googleId = googleId;
        await user.save();
      } else {
        user = await User.create({
          googleId,
          email,
          username: `${given_name} ${family_name}`,
          role: 'user',
          password: null
        });
      }
    }

    // Génère JWT
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('[AuthController]', err);
    next(err);
  }
};
