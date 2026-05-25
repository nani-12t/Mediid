const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const Pharmacy = require('../models/Pharmacy');
const { protect, authorize } = require('../middleware/auth');

// @route GET /api/pharmacy-portal/prescription/:uid
// Lookup patient's prescriptions for the current hospital
router.get('/prescription/:uid', protect, authorize('pharmacy', 'hospital_admin'), async (req, res) => {
  try {
    let hospitalName = '';
    const pharmacy = await Pharmacy.findOne({ user: req.user._id }).populate('hospital', 'name');
    
    if (!pharmacy) {
      if (req.user.role === 'hospital_admin') {
        const hospital = await require('../models/Hospital').findOne({ admin: req.user._id });
        if (hospital) hospitalName = hospital.name;
      } else {
        return res.status(404).json({ message: 'Pharmacy profile not found' });
      }
    } else {
      hospitalName = pharmacy.hospital.name;
    }

    const patient = await Patient.findOne({ uid: req.params.uid });
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    // Filter documents to show only prescriptions from this hospital
    const prescriptions = patient.documents.filter(d => 
      d.type === 'prescription' && 
      d.hospitalName === hospitalName
    );

    res.json({
      patient: {
        name: `${patient.firstName} ${patient.lastName}`,
        uid: patient.uid,
        age: patient.dateOfBirth ? Math.floor((new Date() - new Date(patient.dateOfBirth)) / 31557600000) : '—',
        gender: patient.gender
      },
      prescriptions
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route POST /api/pharmacy-portal/dispense
// Record medication dispensing and bill creation
router.post('/dispense', protect, authorize('pharmacy', 'hospital_admin'), async (req, res) => {
  try {
    const { patientId, prescriptionId, medicines, totalAmount } = req.body;
    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    let hospitalName = 'Hospital Pharmacy';
    if (req.user.role === 'hospital_admin') {
      const hospital = await require('../models/Hospital').findOne({ admin: req.user._id });
      if (hospital) hospitalName = hospital.name;
    } else {
      const pharmacy = await Pharmacy.findOne({ user: req.user._id }).populate('hospital', 'name');
      if (pharmacy) hospitalName = pharmacy.hospital.name;
    }

    // Add note to patient's medical history
    patient.medicalHistory.push({
      date: new Date(),
      diagnosis: 'Medication Dispensed',
      treatment: `Dispensed: ${medicines.map(m => `${m.name} (Qty: ${m.qty})`).join(', ')}`,
      hospital: hospitalName,
      doctor: 'Hospital Pharmacist',
      notes: `Dispensed against prescription: ${prescriptionId ? 'ID ' + prescriptionId : 'Direct issue'}`
    });

    // Create a paid bill
    const billId = `BILL-PHARMA-${Math.floor(100000 + Math.random() * 900000)}`;
    patient.bills.push({
      billId,
      title: 'Pharmacy Medication Checkout',
      category: 'Pharmacy',
      hospitalName,
      doctorName: 'Hospital Pharmacist',
      amount: totalAmount,
      status: 'paid',
      date: new Date(),
      dueDate: new Date(),
      paidAt: new Date(),
      paymentMethod: 'Cash/Card at Pharmacy Counter'
    });

    // Mark the prescription document as dispensed in notes
    if (prescriptionId) {
      const doc = patient.documents.id(prescriptionId);
      if (doc) {
        doc.notes = (doc.notes || '') + '\n[STATUS: DISPENSED AT PHARMACY COUNTER]';
      }
    }

    await patient.save();
    res.json({ message: 'Medications successfully dispensed, record updated', billId });
  } catch (error) {
    console.error('Dispense error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
