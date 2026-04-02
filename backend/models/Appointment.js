const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },

  appointmentDate: { type: Date, required: true },
  timeSlot: String,

  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled', 'rescheduled'],
    default: 'pending'
  },

  type: { type: String, enum: ['consultation', 'follow_up', 'emergency', 'procedure'], default: 'consultation' },
  
  bookingMethod: { type: String, enum: ['app', 'phone', 'whatsapp', 'sms', 'walk_in'], default: 'app' },
  
  preferredContactMethod: { type: String, enum: ['whatsapp', 'sms', 'phone', 'email'], default: 'whatsapp' },
  
  contactPhone: String,
  notes: String,
  
  // Hospital staff handling
  handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  staffNotes: String,
  
  // Confirmation
  confirmedAt: Date,
  confirmationMethod: String,
  
  // Prescription after visit
  prescription: {
    uploadedAt: Date,
    fileUrl: String,
    notes: String
  },
  
  // Bill
  billAmount: Number,
  billStatus: { type: String, enum: ['pending', 'paid', 'insurance_claimed'], default: 'pending' },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Appointment', appointmentSchema);
