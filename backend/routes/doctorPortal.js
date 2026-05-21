const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const { protect, authorize } = require('../middleware/auth');

// @route GET /api/doctor-portal/queue
// Get today's appointments for the logged-in doctor
router.get('/queue', protect, authorize('doctor', 'hospital_admin'), async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ user: req.user._id });
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
      status: { $in: ['pending', 'confirmed', 'completed'] }
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

    // 2. Find appointments between this doctor and the patient
    const appointments = await Appointment.find({
      doctor: doctor._id,
      patient: patient._id
    });

    if (appointments.length === 0) {
      return res.status(403).json({
        message: 'Access Denied: No appointment found with this patient.',
        code: 'FORBIDDEN',
        reason: 'no_appointment'
      });
    }

    // 3. Verify access based on confirmation status and time-slot
    let hasAccess = false;
    let onlyPending = true;
    let nearestFutureAppt = null;
    const now = new Date();

    for (const appt of appointments) {
      if (appt.status === 'confirmed' || appt.status === 'completed') {
        onlyPending = false;
        const apptStart = getAppointmentStartDateTime(appt.appointmentDate, appt.timeSlot);
        if (apptStart) {
          const accessStart = new Date(apptStart.getTime() - 10 * 60 * 1000);
          if (now >= accessStart) {
            hasAccess = true;
            break;
          } else {
            if (!nearestFutureAppt || apptStart < nearestFutureAppt) {
              nearestFutureAppt = apptStart;
            }
          }
        }
      }
    }

    if (hasAccess) {
      const patientData = await Patient.findOne({ uid: req.params.uid }).select('-user -qrActive');
      return res.json(patientData);
    }

    if (onlyPending) {
      return res.status(403).json({
        message: 'Access Denied: Appointment is awaiting admin confirmation.',
        code: 'FORBIDDEN',
        reason: 'awaiting_confirmation'
      });
    }

    const formattedTime = nearestFutureAppt ? nearestFutureAppt.toLocaleString() : 'scheduled time';
    return res.status(403).json({
      message: `Access Denied: Access opens 10 minutes prior to the appointment.`,
      code: 'FORBIDDEN',
      reason: 'time_restriction',
      opensAt: nearestFutureAppt ? new Date(nearestFutureAppt.getTime() - 10 * 60 * 1000).toISOString() : null,
      scheduledTime: formattedTime
    });
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
    }

    res.json({ message: 'Prescription saved successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
