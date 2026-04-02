const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },

  // Auto-generated: HID-XXXXXXXX-STF-0001 (tied to hospital UID)
  uid: { type: String, unique: true },
  qrCode: { type: String }, // base64 QR image

  firstName: { type: String, required: true },
  lastName: { type: String, required: true },

  role: {
    type: String,
    enum: ['nurse', 'receptionist', 'lab_technician', 'pharmacist', 'ward_boy', 'security', 'administrator', 'radiologist', 'physiotherapist', 'other'],
    required: true
  },
  department: String,

  employeeId: String,         // Hospital's internal employee code (optional)
  qualifications: [String],
  experience: Number,

  phone: String,
  email: String,
  photo: String,

  dateOfJoining: Date,
  shift: { type: String, enum: ['morning', 'afternoon', 'night', 'rotational'], default: 'morning' },

  status: { type: String, enum: ['active', 'on_leave', 'inactive'], default: 'active' },
  isActive: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now }
});

staffSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

module.exports = mongoose.model('Staff', staffSchema);
