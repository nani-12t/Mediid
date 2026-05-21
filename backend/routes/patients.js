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

// ── Bills & Expenses ───────────────────────────────────────────────

// GET /api/patients/bills - Fetches unified list of appointment and custom bills
router.get('/bills', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

    const Appointment = require('../models/Appointment');
    const appointments = await Appointment.find({ patient: patient._id })
      .populate('doctor', 'firstName lastName consultationFee')
      .populate('hospital', 'name');

    const appointmentBills = appointments.map(apt => {
      const docName = apt.doctor ? `Dr. ${apt.doctor.firstName} ${apt.doctor.lastName}` : 'General Doctor';
      const hospName = apt.hospital ? apt.hospital.name : 'Clinic/Hospital';
      const fee = (apt.doctor && apt.doctor.consultationFee) ? apt.doctor.consultationFee : 500;
      
      return {
        billId: apt._id.toString(),
        title: `Consultation Fee - ${docName}`,
        category: 'Consultation',
        hospitalName: hospName,
        doctorName: docName,
        amount: apt.billAmount || fee,
        status: apt.billStatus || 'pending',
        date: apt.appointmentDate,
        dueDate: new Date(new Date(apt.appointmentDate).getTime() + 7 * 24 * 60 * 60 * 1000),
        isAppointment: true,
      };
    });

    const customBills = patient.bills.map(b => ({
      billId: b.billId,
      title: b.title,
      category: b.category,
      hospitalName: b.hospitalName,
      doctorName: b.doctorName,
      amount: b.amount,
      status: b.status,
      date: b.date,
      dueDate: b.dueDate,
      paidAt: b.paidAt,
      paymentMethod: b.paymentMethod,
      isAppointment: false,
    }));

    const allBills = [...appointmentBills, ...customBills];
    allBills.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(allBills);
  } catch (e) {
    console.error('Error fetching bills:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/patients/bills - Adds a custom diagnostic bill
router.post('/bills', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

    const { title, category, hospitalName, doctorName, amount, dueDate } = req.body;
    if (!title || !category || !amount) {
      return res.status(400).json({ message: 'Title, category, and amount are required' });
    }

    const newBill = {
      billId: 'BILL-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      title,
      category,
      hospitalName: hospitalName || 'MediID Diagnostic Lab',
      doctorName: doctorName || 'Lab Specialist',
      amount: Number(amount),
      status: 'pending',
      date: new Date(),
      dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };

    patient.bills.push(newBill);
    await patient.save();

    res.status(201).json(newBill);
  } catch (e) {
    console.error('Error creating bill:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/patients/bills/:billId/pay - Pays a bill
router.put('/bills/:billId/pay', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

    const { paymentMethod } = req.body;

    const bill = patient.bills.find(b => b.billId === req.params.billId);
    if (bill) {
      bill.status = 'paid';
      bill.paidAt = new Date();
      bill.paymentMethod = paymentMethod || 'UPI / Card';
      await patient.save();
      return res.json({ message: 'Bill paid successfully', bill });
    }

    const Appointment = require('../models/Appointment');
    const appointment = await Appointment.findById(req.params.billId);
    if (appointment) {
      appointment.billStatus = 'paid';
      appointment.updatedAt = new Date();
      await appointment.save();
      return res.json({ message: 'Appointment fee paid successfully', appointment });
    }

    res.status(404).json({ message: 'Bill not found' });
  } catch (e) {
    console.error('Error paying bill:', e);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;