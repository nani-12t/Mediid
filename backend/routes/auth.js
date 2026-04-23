const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Buyer = require('../models/marketplace/Buyer');
const { protect } = require('../middleware/auth');
const { generatePatientIDAndQR } = require('../utils/idGenerator');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET || 'mediid_secret', {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });

/* ══════════════════════════════════════════════════
   POST /api/auth/register
══════════════════════════════════════════════════ */
router.post('/register', [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['patient', 'buyer']).withMessage('Role must be patient or buyer'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array(), message: errors.array().map(e => e.msg).join(', ') });
  }

  try {
    const { email, password, role, firstName, lastName, phone } = req.body;
    console.log(`📝 Registration attempt for: ${email} (Role: ${role})`);

    // Ensure DB connection
    if (mongoose.connection.readyState === 0) {
      await connectDB();
    }

    const existing = await User.findOne({ email });
    if (existing) {
      console.log(`⚠️ Registration failed: Email ${email} already exists`);
      return res.status(409).json({ message: 'Email already registered' });
    }

    const user = await User.create({ email, password, role });
    console.log(`✅ User record created: ${user._id}`);

    let profile = null;

    if (role === 'patient') {
      const name = `${(firstName || '').trim()} ${(lastName || '').trim()}`.trim() || email;
      console.log(`🧬 Generating ID/QR for patient: ${name}`);
      const { uid, qrCode } = await generatePatientIDAndQR({ name, email });

      await Patient.create({
        user: user._id,
        firstName: (firstName || '').trim(),
        lastName: (lastName || '').trim(),
        phone: phone || '',
        uid,
        qrCode,
      });
      console.log(`✅ Patient profile created: ${uid}`);
      profile = await Patient.findOne({ user: user._id }).select('uid firstName lastName profilePhoto qrCode phone');

    } else if (role === 'buyer') {
      const companyName = (req.body.companyName || `${firstName || ''} ${lastName || ''}`).trim() || email;
      console.log(`🛒 Creating Buyer profile: ${companyName}`);
      const buyer = await Buyer.create({
        user: user._id,
        companyName,
        phone: phone || '',
        description: req.body.description || '',
        website: req.body.website || '',
      });
      console.log(`✅ Buyer profile created: ${buyer._id}`);
      profile = { id: buyer._id, companyName: buyer.companyName };
    }

    const token = generateToken(user._id);
    console.log(`🎉 Registration successful for ${email}`);
    res.status(201).json({
      token,
      user: { id: user._id, email: user.email, role: user.role },
      profile,
    });
  } catch (error) {
    console.error('❌ Register error detail:', error);
    res.status(500).json({ message: 'Server error during registration', error: error.message });
  }
});

/* ══════════════════════════════════════════════════
   POST /api/auth/login
══════════════════════════════════════════════════ */
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array(), message: errors.array().map(e => e.msg).join(', ') });
  }

  try {
    const { email, password } = req.body;
    console.log(`🔐 Login attempt: ${email}`);

    if (mongoose.connection.readyState === 0) {
      await connectDB();
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);

    let profile = null;
    if (user.role === 'patient') {
      profile = await Patient.findOne({ user: user._id }).select('uid firstName lastName profilePhoto qrCode phone');
    } else if (user.role === 'buyer') {
      profile = await Buyer.findOne({ user: user._id }).select('companyName description phone website');
    }

    console.log(`✅ Login successful: ${email}`);
    res.json({ token, user: { id: user._id, email: user.email, role: user.role }, profile });
  } catch (error) {
    console.error('❌ Login error detail:', error);
    res.status(500).json({ message: 'Server error during login', error: error.message });
  }
});

/* ══════════════════════════════════════════════════
   GET /api/auth/me
══════════════════════════════════════════════════ */
router.get('/me', protect, async (req, res) => {
  try {
    let profile = null;
    if (req.user.role === 'patient') {
      profile = await Patient.findOne({ user: req.user._id });
    } else if (req.user.role === 'buyer') {
      profile = await Buyer.findOne({ user: req.user._id });
    }
    res.json({ user: req.user, profile });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;