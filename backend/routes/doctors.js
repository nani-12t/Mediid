const express = require('express');
const router = express.Router();
const Doctor = require('../models/Doctor');
const Hospital = require('../models/Hospital');
const { protect, authorize } = require('../middleware/auth');
const { generateDoctorIDAndQR } = require('../utils/idGenerator');

// @route GET /api/doctors (public - search)
router.get('/', async (req, res) => {
  try {
    const { q, specialization, hospital, available } = req.query;
    let query = { isActive: true };
    if (specialization) query.specialization = new RegExp(specialization, 'i');
    if (hospital) query.hospital = hospital;
    if (q) query.$or = [
      { firstName: new RegExp(q, 'i') },
      { lastName: new RegExp(q, 'i') },
      { specialization: new RegExp(q, 'i') },
      { expertise: new RegExp(q, 'i') }
    ];
    if (available === 'true') query.status = 'available';
    const doctors = await Doctor.find(query)
      .populate('hospital', 'name address uid')
      .sort({ 'rating.average': -1 });
    res.json(doctors);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route POST /api/doctors (hospital admin recruits a doctor → auto-generate UID + QR)
router.post('/', protect, authorize('hospital_admin'), async (req, res) => {
  try {
    const hospital = await Hospital.findOne({ user: req.user._id });
    if (!hospital) return res.status(404).json({ message: 'Hospital not found' });

    // Increment doctor sequence counter atomically
    const updatedHospital = await Hospital.findByIdAndUpdate(
      hospital._id,
      { $inc: { doctorSequence: 1 } },
      { new: true }
    );

    // Generate Doctor UID based on Hospital UID + sequence
    // e.g. HID-C4E1A2B3-DOC-0001
    const { uid, qrCode } = await generateDoctorIDAndQR(
      hospital.uid,
      updatedHospital.doctorSequence,
      {
        name: `Dr. ${req.body.firstName} ${req.body.lastName}`,
        specialization: req.body.specialization,
        hospitalName: hospital.name
      }
    );

    const doctor = await Doctor.create({
      ...req.body,
      hospital: hospital._id,
      uid,
      qrCode
    });

    // Add doctor to hospital roster
    await Hospital.findByIdAndUpdate(hospital._id, { $push: { doctors: doctor._id } });

    console.log(`✅ Doctor recruited: ${uid} at ${hospital.uid}`);

    await doctor.populate('hospital', 'name uid');
    res.status(201).json(doctor);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route GET /api/doctors/:id
router.get('/:id', async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id).populate('hospital', 'name address uid');
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    res.json(doctor);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route GET /api/doctors/uid/:uid (scan doctor QR)
router.get('/uid/:uid', async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ uid: req.params.uid })
      .populate('hospital', 'name address uid contact');
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    res.json(doctor);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route PUT /api/doctors/:id
router.put('/:id', protect, authorize('hospital_admin'), async (req, res) => {
  try {
    const doctor = await Doctor.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(doctor);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route DELETE /api/doctors/:id
router.delete('/:id', protect, authorize('hospital_admin'), async (req, res) => {
  try {
    const doctor = await Doctor.findByIdAndDelete(req.params.id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    const hospital = await Hospital.findOne({ user: req.user._id });
    await Hospital.findByIdAndUpdate(hospital._id, { $pull: { doctors: doctor._id } });
    res.json({ message: 'Doctor removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
