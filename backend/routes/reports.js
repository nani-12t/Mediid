const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

// Reports are stored in Patient.documents
// This route handles hospital-side report uploads for patient records

router.post('/upload', protect, authorize('hospital_admin', 'doctor'), async (req, res) => {
  try {
    const Patient = require('../models/Patient');
    const Hospital = require('../models/Hospital');
    const Doctor = require('../models/Doctor');
    
    const { patientUid, report } = req.body;
    const patient = await Patient.findOne({ uid: patientUid });
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    
    let hospitalName = '';
    let doctorName = '';
    
    if (req.user.role === 'hospital_admin') {
      const hospital = await Hospital.findOne({ user: req.user._id });
      if (hospital) {
        hospitalName = hospital.name;
      }
    } else if (req.user.role === 'doctor') {
      const doctor = await Doctor.findOne({ user: req.user._id }).populate('hospital');
      if (doctor) {
        doctorName = `Dr. ${doctor.firstName} ${doctor.lastName}`;
        if (doctor.hospital) {
          hospitalName = doctor.hospital.name;
        }
      }
    }
    
    const reportData = {
      ...report,
      hospitalName: report.hospitalName || hospitalName,
      doctorName: report.doctorName || doctorName,
      uploadedBy: req.user._id,
      uploadedAt: new Date()
    };

    patient.documents.push(reportData);
    await patient.save();
    res.status(201).json({ message: 'Report uploaded', document: patient.documents.at(-1) });
  } catch (error) {
    console.error('Error uploading report:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/hospital', protect, authorize('hospital_admin'), async (req, res) => {
  try {
    const Patient = require('../models/Patient');
    const patients = await Patient.find({ 'documents.uploadedBy': req.user._id });
    
    let reports = [];
    patients.forEach(patient => {
      patient.documents.forEach(doc => {
        if (doc.uploadedBy && doc.uploadedBy.toString() === req.user._id.toString()) {
          reports.push({
            _id: doc._id,
            patientUid: patient.uid,
            patientName: `${patient.firstName} ${patient.lastName}`,
            type: doc.type,
            title: doc.title,
            fileUrl: doc.fileUrl,
            fileName: doc.fileName,
            fileSize: doc.fileSize,
            uploadedAt: doc.uploadedAt,
            notes: doc.notes,
            hospitalName: doc.hospitalName,
            doctorName: doc.doctorName
          });
        }
      });
    });

    reports.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    res.json(reports);
  } catch (error) {
    console.error('Error fetching hospital reports:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
