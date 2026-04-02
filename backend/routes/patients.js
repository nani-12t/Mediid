const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const { protect, authorize } = require('../middleware/auth');
const { generateQRCode } = require('../utils/idGenerator');

// @route GET /api/patients/profile
router.get('/profile', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    if (!patient) return res.status(404).json({ message: 'Patient profile not found' });
    res.json(patient);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route PUT /api/patients/profile
router.put('/profile', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOneAndUpdate(
      { user: req.user._id },
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    res.json(patient);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route GET /api/patients/qr — returns stored QR (generated at registration)
router.get('/qr', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    // If QR somehow missing, regenerate and save it
    if (!patient.qrCode) {
      patient.qrCode = await generateQRCode({ uid: patient.uid }, 'patient');
      await patient.save();
    }

    res.json({ uid: patient.uid, qrCode: patient.qrCode });
  } catch (error) {
    res.status(500).json({ message: 'QR fetch failed' });
  }
});

// @route GET /api/patients/scan/:uid — public, shows emergency info only
router.get('/scan/:uid', async (req, res) => {
  try {
    const patient = await Patient.findOne({ uid: req.params.uid })
      .select('firstName lastName emergency uid');
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    res.json({
      uid: patient.uid,
      name: `${patient.firstName} ${patient.lastName}`,
      emergency: patient.emergency
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route POST /api/patients/documents
router.post('/documents', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    patient.documents.push(req.body);
    await patient.save();
    res.status(201).json(patient.documents[patient.documents.length - 1]);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route DELETE /api/patients/documents/:docId
router.delete('/documents/:docId', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    patient.documents = patient.documents.filter(d => d._id.toString() !== req.params.docId);
    await patient.save();
    res.json({ message: 'Document removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route POST /api/patients/government-benefits
router.post('/government-benefits', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    patient.governmentBenefits.push(req.body);
    await patient.save();
    res.status(201).json(patient.governmentBenefits);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
