const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Hospital = require('../models/Hospital');
const { protect } = require('../middleware/auth');
const { generatePatientIDAndQR, generateHospitalIDAndQR } = require('../utils/idGenerator');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET || 'mediid_secret', {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });

// @route POST /api/auth/register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('role').isIn(['patient', 'hospital_admin', 'doctor']),
  body('firstName').optional().notEmpty(),
  body('lastName').optional().notEmpty(),
  body('hospitalName').optional().notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { email, password, role, firstName, lastName, hospitalName } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(409).json({ message: 'Email already registered' });

    const user = await User.create({ email, password, role });

    let profile = null;

    if (role === 'patient') {
      // Generate unique Patient UID + QR on registration
      const { uid, qrCode } = await generatePatientIDAndQR({
        name: `${firstName} ${lastName}`,
        email
      });
      await Patient.create({ user: user._id, firstName, lastName, uid, qrCode });
      profile = await Patient.findOne({ user: user._id }).select('uid firstName lastName profilePhoto qrCode');

    } else if (role === 'hospital_admin') {
      // Generate unique Hospital UID + QR on registration
      const name = hospitalName || `${firstName} ${lastName}'s Hospital`;
      const { uid, qrCode } = await generateHospitalIDAndQR({ name, email });
      await Hospital.create({
        user: user._id,
        name,
        uid,
        qrCode,
        contact: { email }
      });
      profile = await Hospital.findOne({ user: user._id }).select('uid name logo qrCode');
    }

    const token = generateToken(user._id);
    res.status(201).json({
      token,
      user: { id: user._id, email: user.email, role: user.role },
      profile
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// @route POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

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
      profile = await Patient.findOne({ user: user._id }).select('uid firstName lastName profilePhoto qrCode');
    } else if (user.role === 'hospital_admin') {
      profile = await Hospital.findOne({ user: user._id }).select('uid name logo qrCode');
    }

    res.json({ token, user: { id: user._id, email: user.email, role: user.role }, profile });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// @route GET /api/auth/me
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
