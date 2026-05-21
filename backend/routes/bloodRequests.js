const express = require('express');
const router = express.Router();
const BloodRequest = require('../models/BloodRequest');
const Patient = require('../models/Patient');
const { protect, authorize } = require('../middleware/auth');

// @route POST /api/blood-requests
// @desc Create a new blood request
// @access Private (Patient only)
router.post('/', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

    const { bloodGroup, units, hospital, urgency, reason, requesterName, requesterPhone, requesterRelation } = req.body;

    if (!bloodGroup || !units || !hospital) {
      return res.status(400).json({ message: 'Blood group, units, and hospital are required.' });
    }

    const bloodRequest = await BloodRequest.create({
      patient: patient._id,
      patientName: `${patient.firstName} ${patient.lastName}`,
      bloodGroup,
      units: Number(units),
      hospital,
      urgency: urgency || 'normal',
      reason,
      requesterName: requesterName || `${patient.firstName} ${patient.lastName}`,
      requesterPhone: requesterPhone || patient.phone,
      requesterRelation: requesterRelation || 'Self',
      status: 'pending',
    });

    res.status(201).json(bloodRequest);
  } catch (error) {
    console.error('Blood request error:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
});

// @route GET /api/blood-requests/my
// @desc Get my blood requests
// @access Private (Patient only)
router.get('/my', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    if (!patient) return res.json([]);

    const requests = await BloodRequest.find({ patient: patient._id }).sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    console.error('Fetch blood requests error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
