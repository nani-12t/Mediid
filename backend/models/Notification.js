const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  type: { type: String, enum: ['in_app', 'sms', 'email'], required: true },
  status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
  message: { type: String, required: true },
  recipient: { type: String, required: true }, // phone, email, or user ID
  sentAt: Date,
  error: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', notificationSchema);
