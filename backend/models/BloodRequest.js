const mongoose = require('mongoose');

const bloodRequestSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
  },
  patientName: { type: String, required: true },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    required: true,
  },
  units: { type: Number, required: true },
  hospital: { type: String, required: true },
  urgency: {
    type: String,
    enum: ['normal', 'urgent', 'critical'],
    default: 'normal',
  },
  reason: String,
  requesterName: String,
  requesterPhone: String,
  requesterRelation: String,
  status: {
    type: String,
    enum: ['pending', 'fulfilled', 'cancelled'],
    default: 'pending',
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('BloodRequest', bloodRequestSchema);
