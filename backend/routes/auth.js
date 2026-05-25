const express = require('express');
const router  = express.Router();
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User     = require('../models/User');
const Patient  = require('../models/Patient');
const Hospital = require('../models/Hospital');
const Buyer    = require('../models/marketplace/Buyer');
const { protect } = require('../middleware/auth');
const { generatePatientIDAndQR, generateHospitalIDAndQR } = require('../utils/idGenerator');
const Doctor = require('../models/Doctor');
const Pharmacy = require('../models/Pharmacy');

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET || 'mediid_secret', {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });

/* ══════════════════════════════════════════════════
   POST /api/auth/register
══════════════════════════════════════════════════ */
router.post('/register', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['patient', 'hospital_admin', 'buyer', 'doctor']).withMessage('Invalid role'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array(), message: errors.array().map(e => e.msg).join(', ') });
  }

  try {
    const { email, password, role, firstName, lastName, hospitalName, phone, registrationNumber } = req.body;
    console.log(`📝 Registration attempt for: ${email} (Role: ${role})`);

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
        user:      user._id,
        firstName: (firstName || '').trim(),
        lastName:  (lastName  || '').trim(),
        phone:     phone || '',
        uid,
        qrCode,
      });
      console.log(`✅ Patient profile created: ${uid}`);
      profile = await Patient.findOne({ user: user._id }).select('uid firstName lastName profilePhoto qrCode phone');

    } else if (role === 'hospital_admin') {
      const name = (hospitalName || `${firstName || ''} ${lastName || ''}`).trim() || email;
      console.log(`🏥 Generating ID/QR for hospital: ${name} (Reg: ${registrationNumber})`);
      const { uid, qrCode } = await generateHospitalIDAndQR(registrationNumber, { name, email, registrationNumber });
      
      await Hospital.create({
        user:    user._id,
        name,
        uid,
        qrCode,
        registrationNumber: registrationNumber || '',
        contact: { email, phone: phone || '' },
      });
      console.log(`✅ Hospital profile created: ${uid}`);
      profile = await Hospital.findOne({ user: user._id }).select('uid name logo qrCode');

    } else if (role === 'buyer') {
      const companyName = (req.body.companyName || `${firstName || ''} ${lastName || ''}`).trim() || email;
      console.log(`🛒 Creating Buyer profile: ${companyName}`);
      const buyer = await Buyer.create({
        user:        user._id,
        companyName,
        phone:       phone || '',
        description: req.body.description || '',
        website:     req.body.website || '',
      });
      console.log(`✅ Buyer profile created: ${buyer._id}`);
      profile = { id: buyer._id, companyName: buyer.companyName };

    } else if (role === 'doctor') {
      // Self-registered doctor — creates a pending profile without hospital linkage
      // Hospital admin later links them or they use DoctorActivation with a hospital UID
      const { specialization, qualifications, registrationNumber: medRegNo, phone: docPhone } = req.body;

      // We need a dummy hospital reference — use a placeholder ObjectId
      // The doctor account will be in 'pending_approval' state
      const Hospital = require('../models/Hospital');
      const anyHospital = await Hospital.findOne();

      if (!anyHospital) {
        // Clean up user if no hospital exists yet
        await User.deleteOne({ _id: user._id });
        return res.status(400).json({ message: 'No hospitals registered yet. Please contact a hospital admin to add you to their system.' });
      }

      const doctorProfile = await Doctor.create({
        user:               user._id,
        hospital:           anyHospital._id, // placeholder — to be re-assigned by admin
        firstName:          (firstName || '').trim(),
        lastName:           (lastName  || '').trim(),
        email,
        phone:              docPhone || phone || '',
        specialization:     specialization || 'General Medicine',
        qualifications:     qualifications ? qualifications.split(',').map(q => q.trim()) : ['MBBS'],
        registrationNumber: medRegNo || '',
        status:             'offline',  // awaiting linkage
        isActive:           false,      // requires admin approval
      });
      console.log(`✅ Doctor self-registered (pending): ${doctorProfile._id}`);
      profile = { id: doctorProfile._id, firstName: doctorProfile.firstName, lastName: doctorProfile.lastName, status: 'pending_approval' };
    }

    const token = generateToken(user._id);
    console.log(`🎉 Registration successful for ${email}`);
    res.status(201).json({
      token,
      user:    { id: user._id, email: user.email, role: user.role },
      profile,
    });
  } catch (error) {
    console.error('❌ Register error detail:', error);
    res.status(500).json({ message: 'Server error during registration', error: error.message });
  }
});

/* ══════════════════════════════════════════════════
   POST /api/auth/doctor-activate
   Allows a doctor to setup their login using their HID
══════════════════════════════════════════════════ */
router.post('/doctor-activate', async (req, res) => {
  try {
    let { uid, password } = req.body;
    uid = String(uid).trim().toUpperCase();
    
    console.log(`🏥 Activation attempt for Doctor ID: ${uid}`);
    
    // Find doctor by UID
    const doctor = await Doctor.findOne({ uid });
    if (!doctor) {
      console.warn(`❌ Activation failed: Doctor ID '${uid}' not found`);
      return res.status(404).json({ message: `Doctor ID '${uid}' not found in our records.` });
    }
    
    // Check if already activated
    if (doctor.user) {
      console.warn(`⚠️ Activation failed: Doctor ID '${uid}' already active`);
      return res.status(400).json({ message: 'This professional account has already been activated. Please login.' });
    }

    // Create User with UID and email
    const user = await User.create({ uid, email: doctor.email, password, role: 'doctor' });
    
    // Link to doctor profile
    doctor.user = user._id;
    await doctor.save();

    console.log(`✅ Doctor activated: ${uid} -> User ID: ${user._id}`);

    const token = generateToken(user._id);
    res.status(201).json({ 
      token, 
      user: { id: user._id, email: user.email, uid: user.uid, role: user.role },
      profile: doctor 
    });
  } catch (error) {
    console.error('🔥 Activation error detail:', error);
    res.status(500).json({ 
      message: error.code === 11000 ? 'ID already activated' : 'Activation failed', 
      error: error.message 
    });
  }
});

/* ══════════════════════════════════════════════════
   POST /api/auth/login
══════════════════════════════════════════════════ */
router.post('/login', [
  body('email').notEmpty().withMessage('Email or ID is required'),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array(), message: errors.array().map(e => e.msg).join(', ') });
  }

    try {
    const { email, password } = req.body;
    
    // Search by email OR uid (for doctors)
    const user = await User.findOne({ 
      $or: [
        { email: email?.toLowerCase() },
        { uid: email } // 'email' field in request can be the UID
      ]
    });
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
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
    } else if (user.role === 'hospital_admin') {
      profile = await Hospital.findOne({ user: user._id }).select('uid name logo qrCode contact');
    } else if (user.role === 'buyer') {
      profile = await Buyer.findOne({ user: user._id }).select('companyName description phone website');
    } else if (user.role === 'doctor') {
      profile = await Doctor.findOne({ user: user._id }).populate('hospital', 'name');
    } else if (user.role === 'pharmacy') {
      profile = await Pharmacy.findOne({ user: user._id }).populate('hospital', 'name');
    }

    res.json({ token, user: { id: user._id, email: user.email, role: user.role }, profile });
  } catch (error) {
    res.status(500).json({ 
      message: 'Server error during login', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    });
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
    } else if (req.user.role === 'buyer') {
      profile = await Buyer.findOne({ user: req.user._id });
    } else if (req.user.role === 'doctor') {
      profile = await Doctor.findOne({ user: req.user._id }).populate('hospital', 'name');
    } else if (req.user.role === 'pharmacy') {
      profile = await Pharmacy.findOne({ user: req.user._id }).populate('hospital', 'name');
    }
    res.json({ user: req.user, profile });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

const nodemailer = require('nodemailer');

const sendOTPEmail = async (email, otp) => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'noreply@mediid.com';

  if (!host || !user || !pass) {
    console.log(`\n📧 [EMAIL DEV]`);
    console.log(`   To  : ${email}`);
    console.log(`   OTP : ${otp}`);
    console.log(`   Msg : Your MediID password reset OTP is ${otp}. It is valid for 15 minutes.\n`);
    return true;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port),
      secure: port == 465,
      auth: { user, pass }
    });

    await transporter.sendMail({
      from: `"MediID" <${from}>`,
      to: email,
      subject: 'MediID Password Reset OTP',
      text: `Your password reset OTP is ${otp}. It is valid for 15 minutes.`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-bottom: 16px;">MediID Password Reset</h2>
          <p style="color: #475569; font-size: 16px; line-height: 1.5;">You requested to reset your password. Use the following 6-digit One Time Password (OTP) to complete the reset:</p>
          <div style="background-color: #f1f5f9; padding: 16px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 4px; color: #00b4a0; margin: 24px 0; border-radius: 6px;">
            ${otp}
          </div>
          <p style="color: #64748b; font-size: 14px;">This OTP is valid for 15 minutes. If you did not request this reset, please ignore this email.</p>
          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #94a3b8; font-size: 12px; text-align: center;">MediID — Secure Digital Medical ID System</p>
        </div>
      `
    });
    console.log(`✅ Reset OTP email sent to ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send reset OTP email to ${email}:`, error.message);
    return false;
  }
};

/* ══════════════════════════════════════════════════
   POST /api/auth/forgot-password
   ══════════════════════════════════════════════════ */
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Valid email is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array().map(e => e.msg).join(', ') });
  }

  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log(`⚠️ Forgot password request for non-existent email: ${email}`);
      return res.json({ message: 'If that email is registered, an OTP has been sent.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.resetPasswordToken = otp;
    user.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
    await user.save();

    await sendOTPEmail(user.email, otp);

    res.json({ message: 'If that email is registered, an OTP has been sent.' });
  } catch (error) {
    console.error('🔥 Forgot password error:', error);
    res.status(500).json({ message: 'Server error during forgot password' });
  }
});

/* ══════════════════════════════════════════════════
   POST /api/auth/reset-password
   ══════════════════════════════════════════════════ */
router.post('/reset-password', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('6-digit OTP is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array().map(e => e.msg).join(', ') });
  }

  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordToken: otp,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired OTP code' });
    }

    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    console.log(`✅ Password successfully reset for user: ${email}`);
    res.json({ message: 'Password has been reset successfully. You can now login.' });
  } catch (error) {
    console.error('🔥 Reset password error:', error);
    res.status(500).json({ message: 'Server error during password reset' });
  }
});

module.exports = router;