const mongoose = require('mongoose');
const { generatePatientUID } = require('../utils/idGenerator');

const governmentBenefitSchema = new mongoose.Schema({
  type: { type: String, enum: ['ayushman', 'esi', 'cghs', 'state', 'insurance', 'other'] },
  schemeName: String,
  cardNumber: String,
  beneficiaryName: String,
  coverageAmount: Number,
  validFrom: Date,
  validUntil: Date,
  isActive: { type: Boolean, default: true }
});

const medicalDocumentSchema = new mongoose.Schema({
  type: { type: String, enum: ['prescription', 'scan', 'bill', 'lab_report', 'discharge_summary', 'other'] },
  title: String,
  fileUrl: String,
  fileName: String,
  fileSize: Number,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  hospitalName: String,
  doctorName: String,
  uploadedAt: { type: Date, default: Date.now },
  notes: String
});

const patientSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uid: { type: String, unique: true, default: generatePatientUID },
  qrCode: { type: String }, // base64 QR image, generated on registration
  
  // Personal Info
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  dateOfBirth: Date,
  gender: { type: String, enum: ['male', 'female', 'other'] },
  phone: String,
  address: {
    street: String, city: String, state: String, pincode: String, country: { type: String, default: 'India' }
  },
  profilePhoto: String,

  // Emergency Info (always accessible via QR)
  emergency: {
    bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
    allergies: [String],
    chronicConditions: [String],
    currentMedications: [String],
    emergencyContactName: String,
    emergencyContactPhone: String,
    emergencyContactRelation: String,
    organDonor: { type: Boolean, default: false }
  },

  // Medical History
  medicalHistory: [{
    date: Date,
    diagnosis: String,
    treatment: String,
    hospital: String,
    doctor: String,
    notes: String
  }],

  // Documents
  documents: [medicalDocumentSchema],

  // Government Benefits
  governmentBenefits: [governmentBenefitSchema],

  // Insurance
  insurancePolicies: [{
    policyNumber: String,
    agencyName: String,
    planName: String,
    coverageAmount: Number,
    premium: Number,
    validUntil: Date,
    agentName: String,
    agentPhone: String
  }],

  // Access Control
  trustedDoctors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' }],
  trustedHospitals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' }],
  qrActive: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

patientSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

module.exports = mongoose.model('Patient', patientSchema);
