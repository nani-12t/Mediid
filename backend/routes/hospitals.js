const express = require('express');
const router  = express.Router();
const Hospital = require('../models/Hospital');
const Doctor   = require('../models/Doctor');
const { protect, authorize } = require('../middleware/auth');

// @route GET /api/hospitals — public search, sorted by weighted rating score
router.get('/', async (req, res) => {
  try {
    const { q, city, specialty, rating, type } = req.query;
    let query = { isActive: true };

    if (city)      query['address.city']    = new RegExp(city, 'i');
    if (specialty) query.specialties        = new RegExp(specialty, 'i');
    if (type)      query.type               = type;
    if (rating)    query['rating.average']  = { $gte: parseFloat(rating) };
    if (q) query.$or = [
      { name:       new RegExp(q, 'i') },
      { specialties: new RegExp(q, 'i') },
      { 'address.city': new RegExp(q, 'i') },
    ];

    const hospitals = await Hospital.find(query)
      .populate('doctors', 'firstName lastName specialization rating photo status experience consultationFee qualifications expertise')
      .select('-qrCode -__v')
      .lean();

    // Weighted sort: average × log10(reviewCount + 1)
    // This gives top preference to hospitals with BOTH high rating AND many reviews
    hospitals.sort((a, b) => {
      const scoreA = (a.rating?.average || 0) * Math.log10((a.rating?.count || 0) + 1);
      const scoreB = (b.rating?.average || 0) * Math.log10((b.rating?.count || 0) + 1);
      return scoreB - scoreA;
    });

    res.json(hospitals);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route GET /api/hospitals/top — top 3 by weighted rating (for patient home widget)
router.get('/top', async (req, res) => {
  try {
    const hospitals = await Hospital.find({ isActive: true })
      .populate('doctors', 'firstName lastName specialization rating status consultationFee')
      .select('name address rating specialties facilities type operatingHours totalBeds accreditations isVerified')
      .lean();

    hospitals.sort((a, b) => {
      const sA = (a.rating?.average || 0) * Math.log10((a.rating?.count || 0) + 1);
      const sB = (b.rating?.average || 0) * Math.log10((b.rating?.count || 0) + 1);
      return sB - sA;
    });

    res.json(hospitals.slice(0, 3));
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route GET /api/hospitals/:id — public
router.get('/:id', async (req, res) => {
  try {
    const hospital = await Hospital.findById(req.params.id)
      .populate('doctors')
      .select('-qrCode -__v');
    if (!hospital) return res.status(404).json({ message: 'Hospital not found' });
    res.json(hospital);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route GET /api/hospitals/admin/profile — hospital admin
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
      { new: true, runValidators: true }
    );
    res.json(hospital);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;