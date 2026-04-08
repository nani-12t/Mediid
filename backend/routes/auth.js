const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User     = require('../models/User');
const Patient  = require('../models/Patient');
const Hospital = require('../models/Hospital');
const { protect } = require('../middleware/auth');
const { generatePatientIDAndQR, generateHospitalIDAndQR } = require('../utils/idGenerator');

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
  body('role').isIn(['patient', 'hospital_admin']).withMessage('Role must be patient or hospital_admin'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array(), message: errors.array().map(e => e.msg).join(', ') });
  }

  try {
    const { email, password, role, firstName, lastName, hospitalName, phone } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: 'Email already registered' });

    const user = await User.create({ email, password, role });

    let profile = null;

    if (role === 'patient') {
      const name = `${(firstName || '').trim()} ${(lastName || '').trim()}`.trim() || email;
      const { uid, qrCode } = await generatePatientIDAndQR({ name, email });
      await Patient.create({
        user:      user._id,
        firstName: (firstName || '').trim(),
        lastName:  (lastName  || '').trim(),
        phone:     phone || '',
        uid,
        qrCode,
      });
      profile = await Patient.findOne({ user: user._id }).select('uid firstName lastName profilePhoto qrCode phone');

    } else if (role === 'hospital_admin') {
      const name = (hospitalName || `${firstName || ''} ${lastName || ''}`).trim() || email;
      const { uid, qrCode } = await generateHospitalIDAndQR({ name, email });
      await Hospital.create({
        user:    user._id,
        name,
        uid,
        qrCode,
        contact: { email, phone: phone || '' },
      });
      profile = await Hospital.findOne({ user: user._id }).select('uid name logo qrCode');
    }

    const token = generateToken(user._id);
    res.status(201).json({
      token,
      user:    { id: user._id, email: user.email, role: user.role },
      profile,
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error during registration' });
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
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);

    let profile = null;
    if (user.role === 'patient') {
      profile = await Patient.findOne({ user: user._id }).select('uid firstName lastName profilePhoto qrCode phone');
    } else if (user.role === 'hospital_admin') {
      profile = await Hospital.findOne({ user: user._id }).select('uid name logo qrCode contact');
    }

    res.json({ token, user: { id: user._id, email: user.email, role: user.role }, profile });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
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
    } else if (req.user.role === 'hospital_admin') {
      profile = await Hospital.findOne({ user: req.user._id });
    }
    res.json({ user: req.user, profile });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;