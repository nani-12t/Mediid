const mongoose = require('mongoose');

const accessLogSchema = new mongoose.Schema({
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  accessedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  accessedAt: { type: Date, default: Date.now },
  action: { type: String, required: true }, // e.g. 'view_patient_profile'
  status: { type: String, enum: ['allowed', 'denied'], required: true },
  reason: String,
  sessionUsed: { type: mongoose.Schema.Types.ObjectId, ref: 'ConsultationSession' }
});

module.exports = mongoose.model('AccessLog', accessLogSchema);
