const express = require('express');
const router = express.Router();
const Hospital = require('../models/Hospital');
const Doctor = require('../models/Doctor');
const { protect, authorize } = require('../middleware/auth');

// @route GET /api/hospitals (public - search)
router.get('/', async (req, res) => {
  try {
    const { q, city, specialty, rating } = req.query;
    let query = { isActive: true };
    if (city) query['address.city'] = new RegExp(city, 'i');
    if (specialty) query.specialties = new RegExp(specialty, 'i');
    if (rating) query['rating.average'] = { $gte: parseFloat(rating) };
    if (q) query.$or = [
      { name: new RegExp(q, 'i') },
      { specialties: new RegExp(q, 'i') }
    ];
    const hospitals = await Hospital.find(query)
      .populate('doctors', 'firstName lastName specialization rating photo status')
      .sort({ 'rating.average': -1 })
      .limit(20);
    res.json(hospitals);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route GET /api/hospitals/:id (public)
router.get('/:id', async (req, res) => {
  try {
    const hospital = await Hospital.findById(req.params.id)
      .populate('doctors');
    if (!hospital) return res.status(404).json({ message: 'Hospital not found' });
    res.json(hospital);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route GET /api/hospitals/admin/profile (hospital admin)
router.get('/admin/profile', protect, authorize('hospital_admin'), async (req, res) => {
  try {
    const hospital = await Hospital.findOne({ user: req.user._id }).populate('doctors');
    res.json(hospital);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route PUT /api/hospitals/admin/profile
router.put('/admin/profile', protect, authorize('hospital_admin'), async (req, res) => {
  try {
    const hospital = await Hospital.findOneAndUpdate(
      { user: req.user._id },
      req.body,
      { new: true }
    );
    res.json(hospital);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
