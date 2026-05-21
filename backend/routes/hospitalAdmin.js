const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Pharmacy = require('../models/Pharmacy');
const Hospital = require('../models/Hospital');
const { protect, authorize } = require('../middleware/auth');

// @route POST /api/hospital-admin/doctor-login
// Setup or update login credentials for a doctor
router.post('/doctor-login', protect, authorize('hospital_admin'), async (req, res) => {
  try {
    const { doctorId, email, password } = req.body;
    
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    let user;
    if (doctor.user) {
      user = await User.findById(doctor.user);
      if (email) user.email = email;
      if (password) user.password = password; // Pre-save hook will hash
      await user.save();
    } else {
      user = await User.create({
        email,
        password,
        role: 'doctor'
      });
      doctor.user = user._id;
      await doctor.save();
    }

    res.json({ message: 'Doctor login credentials updated', email: user.email });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route POST /api/hospital-admin/pharmacy-login
// Setup or update the single login credential for the hospital pharmacy
router.post('/pharmacy-login', protect, authorize('hospital_admin'), async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const hospital = await Hospital.findOne({ user: req.user._id });
    if (!hospital) return res.status(404).json({ message: 'Hospital not found' });

    let pharmacy = await Pharmacy.findOne({ hospital: hospital._id });
    let user;

    // Check if the email provided is already used by the current admin
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    
    if (existingUser && existingUser.role === 'hospital_admin' && existingUser._id.toString() === req.user._id.toString()) {
      // Use the admin's user account for pharmacy as well
      user = existingUser;
    } else if (existingUser) {
      // Email is used by someone else
      return res.status(409).json({ message: 'Email already in use by another account' });
    }

    if (pharmacy) {
      if (!user) {
        user = await User.findById(pharmacy.user);
        if (email) user.email = email;
        if (password) user.password = password;
        await user.save();
      } else {
        // Just link to existing admin user
        pharmacy.user = user._id;
        await pharmacy.save();
      }
    } else {
      if (!user) {
        user = await User.create({ email, password, role: 'pharmacy' });
      }
      pharmacy = await Pharmacy.create({
        user: user._id,
        hospital: hospital._id,
        name: `${hospital.name} Pharmacy`
      });
      hospital.pharmacy = pharmacy._id;
      await hospital.save();
    }

    res.json({ message: 'Pharmacy login credentials updated', email: user.email });
  } catch (error) {
    console.error('🔥 Pharmacy Setup error:', error);
    res.status(500).json({ 
      message: error.code === 11000 ? 'Email already in use by another user' : 'Setup failed', 
      detail: error.message 
    });
  }
});

module.exports = router;
