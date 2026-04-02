const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },

  // Auto-generated: HID-XXXXXXXX-DOC-0001 (tied to hospital UID)
  uid: { type: String, unique: true },
  qrCode: { type: String }, // base64 QR image

  firstName: { type: String, required: true },
  lastName: { type: String, required: true },

  qualifications: [String],
  specialization: { type: String, required: true },
  subSpecialties: [String],

  experience: Number,
  registrationNumber: String,

  phone: String,
  email: String,
  photo: String,

  consultationFee: Number,

  availability: [{
    day: { type: String, enum: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] },
    startTime: String,
    endTime: String,
    maxAppointments: { type: Number, default: 20 }
  }],

  expertise: [String],
  languages: [String],

  rating: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },

  status: { type: String, enum: ['available', 'busy', 'on_leave', 'offline'], default: 'available' },
  isActive: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now }
});

doctorSchema.virtual('fullName').get(function () {
  return `Dr. ${this.firstName} ${this.lastName}`;
});

module.exports = mongoose.model('Doctor', doctorSchema);
