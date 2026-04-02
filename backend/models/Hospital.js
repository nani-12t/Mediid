const mongoose = require('mongoose');
const { generateHospitalUID } = require('../utils/idGenerator');

const hospitalSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Auto-generated Hospital ID (HID-XXXXXXXX) and QR
  uid: { type: String, unique: true, default: generateHospitalUID },
  qrCode: { type: String }, // base64 QR image, stored on registration

  name: { type: String, required: true },
  registrationNumber: { type: String },
  type: { type: String, enum: ['government', 'private', 'trust', 'clinic'], default: 'private' },

  address: {
    street: String, city: String, state: String, pincode: String,
    coordinates: { lat: Number, lng: Number }
  },

  contact: { phone: String, email: String, website: String, emergencyPhone: String },

  specialties: [String],
  facilities: [String],

  operatingHours: {
    weekdays: { open: String, close: String },
    weekends: { open: String, close: String },
    is24x7: { type: Boolean, default: false }
  },

  totalBeds: Number,
  icuBeds: Number,

  logo: String,
  photos: [String],

  rating: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },

  doctors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' }],
  staff: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }],

  // Sequence counters — used to generate sequential doctor/staff IDs under this hospital
  doctorSequence: { type: Number, default: 0 },
  staffSequence: { type: Number, default: 0 },

  accreditations: [String],

  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Hospital', hospitalSchema);
