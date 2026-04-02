const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const Hospital = require('../models/Hospital');
const { protect, authorize } = require('../middleware/auth');
const { sendWhatsAppMessage, sendSMSMessage, generateAppointmentMessage } = require('../utils/notifications');

// @route POST /api/appointments (patient books)
router.post('/', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    const appointment = await Appointment.create({
      ...req.body,
      patient: patient._id,
      status: 'pending'
    });
    await appointment.populate(['doctor', 'hospital', 'patient']);

    // Send booking confirmation notifications
    const message = generateAppointmentMessage(appointment, req.body.bookingMethod || 'whatsapp');

    if (req.body.bookingMethod === 'whatsapp' || req.body.preferredContactMethod === 'whatsapp') {
      await sendWhatsAppMessage(appointment.patient.phone, message);
    }

    if (req.body.bookingMethod === 'sms' || req.body.preferredContactMethod === 'sms') {
      await sendSMSMessage(appointment.patient.phone, message);
    }

    res.status(201).json(appointment);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route GET /api/appointments/my (patient's appointments)
router.get('/my', protect, authorize('patient'), async (req, res) => {
  try {
    const patient = await Patient.findOne({ user: req.user._id });
    const appointments = await Appointment.find({ patient: patient._id })
      .populate('doctor', 'firstName lastName specialization photo')
      .populate('hospital', 'name address')
      .sort({ appointmentDate: -1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route GET /api/appointments/hospital (hospital admin sees all requests)
router.get('/hospital', protect, authorize('hospital_admin'), async (req, res) => {
  try {
    const hospital = await Hospital.findOne({ user: req.user._id });
    const { status } = req.query;
    let query = { hospital: hospital._id };
    if (status) query.status = status;
    const appointments = await Appointment.find(query)
      .populate('patient', 'firstName lastName phone uid')
      .populate('doctor', 'firstName lastName specialization')
      .sort({ createdAt: -1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route PUT /api/appointments/:id/status (hospital confirms/rejects)
router.put('/:id/status', protect, authorize('hospital_admin'), async (req, res) => {
  try {
    const { status, staffNotes, timeSlot, appointmentDate } = req.body;
    const update = { status, staffNotes, handledBy: req.user._id, updatedAt: new Date() };
    if (status === 'confirmed') {
      update.confirmedAt = new Date();
      if (timeSlot) update.timeSlot = timeSlot;
      if (appointmentDate) update.appointmentDate = appointmentDate;
    }
    const appointment = await Appointment.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('patient', 'firstName lastName phone')
      .populate('doctor', 'firstName lastName')
      .populate('hospital', 'name address phone');

    // Send status update notifications
    if (status === 'confirmed' || status === 'cancelled') {
      const message = generateAppointmentMessage(appointment, 'whatsapp');

      // Send WhatsApp if patient prefers WhatsApp
      if (appointment.bookingMethod === 'whatsapp' || appointment.preferredContactMethod === 'whatsapp') {
        await sendWhatsAppMessage(appointment.patient.phone, message);
      }

      // Send SMS if patient prefers SMS
      if (appointment.bookingMethod === 'sms' || appointment.preferredContactMethod === 'sms') {
        await sendSMSMessage(appointment.patient.phone, message);
      }
    }

    res.json(appointment);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route DELETE /api/appointments/:id (patient cancels)
router.delete('/:id', protect, authorize('patient'), async (req, res) => {
  try {
    await Appointment.findByIdAndUpdate(req.params.id, { status: 'cancelled' });
    res.json({ message: 'Appointment cancelled' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
