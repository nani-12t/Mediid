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

module.exports = router;
