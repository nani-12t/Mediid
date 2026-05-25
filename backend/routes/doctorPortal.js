const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const DoctorSlot = require('../models/DoctorSlot');
const { protect, authorize } = require('../middleware/auth');

// @route GET /api/doctor-portal/queue
// Get today's appointments for the logged-in doctor
router.get('/queue', protect, authorize('doctor', 'hospital_admin'), async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ user: req.user._id }).populate('hospital');
    // If admin, maybe show a default doctor or allow searching
    if (!doctor && req.user.role !== 'hospital_admin') return res.status(404).json({ message: 'Doctor profile not found' });

    let query = {};
    if (doctor) {
      query.doctor = doctor._id;
    } else {
      // Admin view: show all appointments for the hospital today
      const hospital = await require('../models/Hospital').findOne({ admin: req.user._id });
      if (hospital) query.hospital = hospital._id;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const appointments = await Appointment.find({
      doctor: doctor._id,
      appointmentDate: { $gte: today, $lt: tomorrow },
      status: { $in: ['pending', 'confirmed', 'checked_in', 'reminder_sent', 'completed'] }
    })
    .populate('patient', 'firstName lastName uid profilePhoto dateOfBirth gender phone emergency bloodGroup')
    .sort({ timeSlot: 1 });

    res.json({
      doctor: {
        name: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        specialization: doctor.specialization,
        hospital: doctor.hospital
      },
      appointments
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

function getAppointmentStartDateTime(date, timeSlotStr) {
  if (!date || !timeSlotStr) return null;
  const match = String(timeSlotStr).trim().match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!match) return null;
  
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  
  if (ampm === 'PM' && hours < 12) {
    hours += 12;
  }
  if (ampm === 'AM' && hours === 12) {
    hours = 0;
  }
  
  const apptTime = new Date(date);
  apptTime.setHours(hours, minutes, 0, 0);
  return apptTime;
}

// @route GET /api/doctor-portal/patient/:uid
// Get full patient profile for the doctor
router.get('/patient/:uid', protect, authorize('doctor', 'hospital_admin'), async (req, res) => {
  try {
    // 1. Hospital Admin bypass
    if (req.user.role === 'hospital_admin') {
      const patient = await Patient.findOne({ uid: req.params.uid }).select('-user -qrActive');
      if (!patient) return res.status(404).json({ message: 'Patient not found' });
      return res.json(patient);
    }

    const doctor = await Doctor.findOne({ user: req.user._id });
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor profile not found' });
    }

    const patient = await Patient.findOne({ uid: req.params.uid });
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const ConsultationSession = require('../models/ConsultationSession');
    const AccessLog = require('../models/AccessLog');

    const activeSession = await ConsultationSession.findOne({
      doctor: doctor._id,
      patient: patient._id,
      status: 'active',
      expiresAt: { $gt: new Date() }
    });

    if (!activeSession) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const appointment = await Appointment.findOne({
        doctor: doctor._id,
        patient: patient._id,
        appointmentDate: { $gte: today, $lt: tomorrow }
      }).sort({ appointmentDate: 1 });

      let reason = 'no_appointment';
      let message = 'Access Denied: No appointment scheduled with this patient today.';
      let code = 'FORBIDDEN';
      let scheduledTime = null;
      let opensAt = null;

      if (appointment) {
        if (appointment.status === 'pending' || appointment.status === 'reminder_sent') {
          reason = 'awaiting_confirmation';
          message = 'Access Denied: Appointment is awaiting patient confirmation.';
        } else if (appointment.status === 'confirmed' || appointment.status === 'checked_in') {
          reason = 'time_restriction';
          message = 'Access Denied: Consultation session is inactive or has expired.';
          const apptStart = getAppointmentStartDateTime(appointment.appointmentDate, appointment.timeSlot);
          if (apptStart) {
            scheduledTime = apptStart.toLocaleString();
            opensAt = new Date(apptStart.getTime() - 10 * 60 * 1000).toISOString();
          }
        } else {
          reason = 'no_appointment';
          message = `Access Denied: Appointment status is ${appointment.status}.`;
        }
      }

      await AccessLog.create({
        doctor: doctor._id,
        patient: patient._id,
        appointment: appointment ? appointment._id : null,
        accessedBy: req.user._id,
        action: 'view_patient_profile',
        status: 'denied',
        reason: message
      });

      return res.status(403).json({
        message,
        code,
        reason,
        scheduledTime,
        opensAt
      });
    }

    // Access allowed
    await AccessLog.create({
      doctor: doctor._id,
      patient: patient._id,
      appointment: activeSession.appointment,
      accessedBy: req.user._id,
      action: 'view_patient_profile',
      status: 'allowed',
      sessionUsed: activeSession._id
    });

    const patientData = await Patient.findOne({ uid: req.params.uid }).select('-user -qrActive');
    return res.json(patientData);
  } catch (error) {
    console.error('Error fetching patient profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route POST /api/doctor-portal/prescription
// Save prescription and complete appointment
router.post('/prescription', protect, authorize('doctor', 'hospital_admin'), async (req, res) => {
  try {
    const { appointmentId, patientId, prescriptionText, notes } = req.body;
    
    const doctor = await Doctor.findOne({ user: req.user._id }).populate('hospital', 'name');
    const patient = await Patient.findById(patientId);
    
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    // Add to patient documents
    patient.documents.push({
      type: 'prescription',
      title: `Prescription from ${doctor.firstName} ${doctor.lastName}`,
      notes: prescriptionText,
      doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
      hospitalName: doctor.hospital?.name || 'Hospital',
      uploadedAt: new Date()
    });

    // Sync to patient's medical history
    patient.medicalHistory.push({
      date: new Date(),
      diagnosis: notes || 'Consultation Follow-up',
      treatment: prescriptionText,
      hospital: doctor.hospital?.name || 'Hospital',
      doctor: `Dr. ${doctor.firstName} ${doctor.lastName}`,
      notes: notes || 'Prescription issued.'
    });

    await patient.save();

    // Update appointment
    if (appointmentId) {
      await Appointment.findByIdAndUpdate(appointmentId, {
        status: 'completed',
        'prescription.notes': prescriptionText,
        'prescription.uploadedAt': new Date(),
        updatedAt: new Date()
      });

      const ConsultationSession = require('../models/ConsultationSession');
      await ConsultationSession.updateMany(
        { appointment: appointmentId, status: 'active' },
        { status: 'completed', completedAt: new Date() }
      );
    }

    res.json({ message: 'Prescription saved successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   SLOT MANAGEMENT — Doctor sets their own availability slots
   GET    /api/doctor-portal/slots           → all my slots
   POST   /api/doctor-portal/slots           → create slot schedule
   PUT    /api/doctor-portal/slots/:id       → update slot schedule
   DELETE /api/doctor-portal/slots/:id       → remove slot schedule
   GET    /api/doctor-portal/slots/available → PUBLIC: query available slots for booking
═══════════════════════════════════════════════════════════ */

// GET  /api/doctor-portal/slots — doctor fetches all their own slot schedules
router.get('/slots', protect, authorize('doctor', 'hospital_admin'), async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ user: req.user._id });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });
    const slots = await DoctorSlot.find({ doctor: doctor._id }).sort({ createdAt: -1 });
    res.json(slots);
  } catch (err) {
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
});

// GET  /api/doctor-portal/slots/available — PUBLIC: find open slots for a doctor on a given date
// ?doctorId=<id>&date=YYYY-MM-DD
router.get('/slots/available', async (req, res) => {
  try {
    const { doctorId, date } = req.query;
    if (!doctorId || !date) return res.status(400).json({ message: 'doctorId and date are required' });

    const [year, month, day] = date.split('-').map(Number);
    const dayName = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

    // Find slot schedules matching this exact date OR this day-of-week
    const schedules = await DoctorSlot.find({
      doctor: doctorId,
      isActive: true,
      $or: [
        { scheduleType: 'date', date },
        { scheduleType: 'day',  day: dayName }
      ]
    });

    if (!schedules.length) return res.json({ date, slots: [], message: 'No availability configured for this date.' });

    // Collect all offered time-slots (merge date-specific + day-recurring)
    const offeredSlots = [...new Set(schedules.flatMap(s => s.timeSlots))].sort();
    const maxBookings  = Math.max(...schedules.map(s => s.maxBookings));

    // Count how many confirmed/pending appointments already exist for each slot
    const booked = await Appointment.find({
      doctor: doctorId,
      appointmentDate: {
        $gte: new Date(`${date}T00:00:00.000Z`),
        $lt:  new Date(`${date}T23:59:59.999Z`)
      },
      status: { $in: ['pending', 'confirmed', 'checked_in', 'reminder_sent'] }
    }).select('timeSlot');

    const bookedCounts = {};
    booked.forEach(a => {
      bookedCounts[a.timeSlot] = (bookedCounts[a.timeSlot] || 0) + 1;
    });

    const slots = offeredSlots.map(slot => ({
      time: slot,
      booked: bookedCounts[slot] || 0,
      capacity: maxBookings,
      available: (bookedCounts[slot] || 0) < maxBookings
    }));

    res.json({ date, dayName, slots });
  } catch (err) {
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
});

// POST /api/doctor-portal/slots — create a new slot schedule
router.post('/slots', protect, authorize('doctor', 'hospital_admin'), async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ user: req.user._id }).populate('hospital');
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const { scheduleType, date, day, timeSlots, maxBookings } = req.body;

    if (!scheduleType || !timeSlots || !timeSlots.length) {
      return res.status(400).json({ message: 'scheduleType and timeSlots are required' });
    }
    if (scheduleType === 'date' && !date) {
      return res.status(400).json({ message: 'date is required for scheduleType=date' });
    }
    if (scheduleType === 'day' && !day) {
      return res.status(400).json({ message: 'day is required for scheduleType=day' });
    }

    const slot = await DoctorSlot.create({
      doctor: doctor._id,
      hospital: doctor.hospital._id || doctor.hospital,
      scheduleType,
      date: scheduleType === 'date' ? date : undefined,
      day:  scheduleType === 'day'  ? day  : undefined,
      timeSlots,
      maxBookings: maxBookings || 1,
      updatedAt: new Date()
    });

    res.status(201).json(slot);
  } catch (err) {
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
});

// PUT /api/doctor-portal/slots/:id — update an existing slot schedule
router.put('/slots/:id', protect, authorize('doctor', 'hospital_admin'), async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ user: req.user._id });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const slot = await DoctorSlot.findOne({ _id: req.params.id, doctor: doctor._id });
    if (!slot) return res.status(404).json({ message: 'Slot schedule not found' });

    const { timeSlots, maxBookings, isActive } = req.body;
    if (timeSlots)   slot.timeSlots   = timeSlots;
    if (maxBookings) slot.maxBookings  = maxBookings;
    if (typeof isActive === 'boolean') slot.isActive = isActive;
    slot.updatedAt = new Date();
    await slot.save();

    res.json(slot);
  } catch (err) {
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
});

// DELETE /api/doctor-portal/slots/:id — permanently remove a slot schedule
router.delete('/slots/:id', protect, authorize('doctor', 'hospital_admin'), async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ user: req.user._id });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const deleted = await DoctorSlot.findOneAndDelete({ _id: req.params.id, doctor: doctor._id });
    if (!deleted) return res.status(404).json({ message: 'Slot schedule not found' });
    res.json({ message: 'Slot schedule deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
});

module.exports = router;
