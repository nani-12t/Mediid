const mongoose = require('mongoose');

const consultationSessionSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true },
  token: { type: String, required: true },
  status: { type: String, enum: ['active', 'completed', 'expired'], default: 'active' },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  completedAt: Date
});

module.exports = mongoose.model('ConsultationSession', consultationSessionSchema);
