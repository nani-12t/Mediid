const express = require('express');
const router  = express.Router();
const Patient = require('../models/Patient');
const { protect, authorize } = require('../middleware/auth');
const { generateQRCode } = require('../utils/idGenerator');

// GET /api/patients/profile
router.get('/profile', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    if (!patient) return res.status(404).json({ message: 'Patient profile not found' });
    res.json(patient);
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
});

// PUT /api/patients/profile
router.put('/profile', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOneAndUpdate(
      { user: req.user._id },
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    res.json(patient);
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
});

// GET /api/patients/qr
router.get('/qr', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    if (!patient.qrCode) {
      patient.qrCode = await generateQRCode({ uid: patient.uid }, 'patient');
      await patient.save();
    }
    res.json({ uid: patient.uid, qrCode: patient.qrCode });
  } catch (e) { res.status(500).json({ message: 'QR fetch failed' }); }
});

// GET /api/patients/scan/:uid  — public
router.get('/scan/:uid', async (req, res) => {
  try {
    const patient = await Patient.findOne({ uid: req.params.uid })
      .select('firstName lastName emergency uid');
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    res.json({ uid: patient.uid, name: `${patient.firstName} ${patient.lastName}`, emergency: patient.emergency });
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
});

// POST /api/patients/documents
router.post('/documents', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    patient.documents.push(req.body);
    await patient.save();
    res.status(201).json(patient.documents[patient.documents.length - 1]);
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/patients/documents/:docId
router.delete('/documents/:docId', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    patient.documents = patient.documents.filter(d => d._id.toString() !== req.params.docId);
    await patient.save();
    res.json({ message: 'Document removed' });
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
});

// ── Medical Benefits (unified govt + employer) ──────────────────────

// POST /api/patients/medical-benefits
router.post('/medical-benefits', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    patient.medicalBenefits.push(req.body);
    await patient.save();
    res.status(201).json(patient.medicalBenefits[patient.medicalBenefits.length - 1]);
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
});

// DELETE /api/patients/medical-benefits/:id
router.delete('/medical-benefits/:id', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    patient.medicalBenefits = patient.medicalBenefits.filter(b => b._id.toString() !== req.params.id);
    await patient.save();
    res.json({ message: 'Benefit removed' });
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
});

// ── Legacy government-benefits (backward compat) ─────────────────────
router.post('/government-benefits', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    patient.governmentBenefits.push(req.body);
    await patient.save();
    res.status(201).json(patient.governmentBenefits);
  } catch (e) { res.status(500).json({ message: 'Server error' }); }
});

module.exports = router;