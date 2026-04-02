const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

// Reports are stored in Patient.documents
// This route handles hospital-side report uploads for patient records

router.post('/upload', protect, authorize('hospital_admin', 'doctor'), async (req, res) => {
  try {
    const Patient = require('../models/Patient');
    const { patientUid, report } = req.body;
    const patient = await Patient.findOne({ uid: patientUid });
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    patient.documents.push({ ...report, uploadedBy: req.user._id });
    await patient.save();
    res.status(201).json({ message: 'Report uploaded', document: patient.documents.at(-1) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
