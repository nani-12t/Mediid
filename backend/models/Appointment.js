const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const appointmentSchema = new mongoose.Schema({
  patient:  { type: mongoose.Schema.Types.ObjectId, ref: 'Patient',  required: true },
  doctor:   { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor',   required: true },
  hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },

  appointmentDate: { type: Date, required: true },
  timeSlot: String,

  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled', 'rescheduled'],
    default: 'pending'
  },

  type: {
    type: String,
    enum: ['consultation', 'follow_up', 'emergency', 'procedure'],
    default: 'consultation'
  },

  bookingMethod: {
    type: String,
    enum: ['app', 'phone', 'whatsapp', 'sms', 'walk_in'],
    default: 'app'
  },

  preferredContactMethod: {
    type: String,
    enum: ['whatsapp', 'sms', 'phone', 'email'],
    default: 'whatsapp'
  },

  contactPhone: String,
  symptoms:    String,
  notes:       String,

  // ── Patient self-confirm via SMS link ──────────────────
  confirmToken:        { type: String, default: () => uuidv4() },  // unique token in SMS link
  confirmTokenUsed:    { type: Boolean, default: false },
  patientConfirmedAt:  Date,   // when patient tapped confirm in SMS

  // ── Hospital staff handling ────────────────────────────
  handledBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  staffNotes:  String,

  // ── Confirmation timestamps ────────────────────────────
  confirmedAt:        Date,
  confirmationMethod: String,   // 'patient_sms' | 'hospital_admin'

  // ── Post-visit ─────────────────────────────────────────
  prescription: { uploadedAt: Date, fileUrl: String, notes: String },

  billAmount:  Number,
  billStatus:  { type: String, enum: ['pending', 'paid', 'insurance_claimed'], default: 'pending' },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Appointment', appointmentSchema);