const express = require('express');
const router = express.Router();
const Staff = require('../models/Staff');
const Hospital = require('../models/Hospital');
const { protect, authorize } = require('../middleware/auth');
const { generateStaffIDAndQR } = require('../utils/idGenerator');

// @route GET /api/staff (hospital admin gets their staff)
router.get('/', protect, authorize('hospital_admin'), async (req, res) => {
  try {
    const hospital = await Hospital.findOne({ user: req.user._id });
    const { role, status } = req.query;
    let query = { hospital: hospital._id, isActive: true };
    if (role) query.role = role;
    if (status) query.status = status;
    const staff = await Staff.find(query).sort({ createdAt: -1 });
    res.json(staff);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route POST /api/staff (hospital admin recruits a staff member → auto UID + QR)
router.post('/', protect, authorize('hospital_admin'), async (req, res) => {
  try {
    const hospital = await Hospital.findOne({ user: req.user._id });
    if (!hospital) return res.status(404).json({ message: 'Hospital not found' });

    // Increment staff sequence counter atomically
    const updatedHospital = await Hospital.findByIdAndUpdate(
      hospital._id,
      { $inc: { staffSequence: 1 } },
      { new: true }
    );

    // Generate Staff UID based on Hospital UID + sequence
    // e.g. HID-C4E1A2B3-STF-0001
    const { uid, qrCode } = await generateStaffIDAndQR(
      hospital.uid,
      updatedHospital.staffSequence,
      {
        name: `${req.body.firstName} ${req.body.lastName}`,
        role: req.body.role,
        hospitalName: hospital.name
      }
    );

    const staff = await Staff.create({
      ...req.body,
      hospital: hospital._id,
      uid,
      qrCode
    });

    // Add staff to hospital roster
    await Hospital.findByIdAndUpdate(hospital._id, { $push: { staff: staff._id } });

    console.log(`✅ Staff recruited: ${uid} at ${hospital.uid}`);
    res.status(201).json(staff);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route GET /api/staff/uid/:uid (scan staff QR)
router.get('/uid/:uid', async (req, res) => {
  try {
    const staff = await Staff.findOne({ uid: req.params.uid })
      .populate('hospital', 'name address uid contact');
    if (!staff) return res.status(404).json({ message: 'Staff member not found' });
    res.json(staff);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route GET /api/staff/:id
router.get('/:id', protect, authorize('hospital_admin'), async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) return res.status(404).json({ message: 'Staff not found' });
    res.json(staff);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route PUT /api/staff/:id
router.put('/:id', protect, authorize('hospital_admin'), async (req, res) => {
  try {
    const staff = await Staff.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(staff);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route DELETE /api/staff/:id
router.delete('/:id', protect, authorize('hospital_admin'), async (req, res) => {
  try {
    const staff = await Staff.findByIdAndDelete(req.params.id);
    if (!staff) return res.status(404).json({ message: 'Staff not found' });
    const hospital = await Hospital.findOne({ user: req.user._id });
    await Hospital.findByIdAndUpdate(hospital._id, { $pull: { staff: staff._id } });
    res.json({ message: 'Staff member removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
