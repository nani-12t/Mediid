const express = require('express');
const router = express.Router();
const MedicineOrder = require('../models/MedicineOrder');
const Patient = require('../models/Patient');
const { protect, authorize } = require('../middleware/auth');

// @route POST /api/medicine-orders
// @desc Place a medicine order
// @access Private (Patient only)
router.post('/', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

    const { items, totalAmount, address, paymentMethod, prescriptionUrl } = req.body;

    if (!items || !items.length || !totalAmount) {
      return res.status(400).json({ message: 'Items and total amount are required.' });
    }

    const order = await MedicineOrder.create({
      patient: patient._id,
      items,
      totalAmount: Number(totalAmount),
      address: address || {
        street: patient.address?.street || '',
        city: patient.address?.city || '',
        state: patient.address?.state || '',
        pincode: patient.address?.pincode || '',
      },
      status: 'pending',
      paymentStatus: 'pending',
      paymentMethod: paymentMethod || 'Cash on Delivery',
      prescriptionUrl,
    });

    res.status(201).json(order);
  } catch (error) {
    console.error('Medicine order error:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
});

// @route GET /api/medicine-orders/my
// @desc Get my medicine orders
// @access Private (Patient only)
router.get('/my', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    if (!patient) return res.json([]);

    const orders = await MedicineOrder.find({ patient: patient._id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    console.error('Fetch medicine orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
