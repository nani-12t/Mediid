const mongoose = require('mongoose');
const { generatePatientUID } = require('../utils/idGenerator');

/* ── Medical benefit schema (govt + employer) ── */
const medicalBenefitSchema = new mongoose.Schema({
  // Core classification
  source: {
    type: String,
    enum: ['government', 'employer', 'personal'],
    required: true,
    default: 'government',
  },
  type: {
    type: String,
    // government: ayushman, esi, cghs, state, other_govt
    // employer:   group_mediclaim, corporate_insurance, esic_employer, other_employer
    // personal:   individual_insurance, family_floater, top_up, other_personal
    default: 'other_govt',
  },

  schemeName:       String,   // "Ayushman Bharat PMJAY" / "Star Health Group Mediclaim"
  cardNumber:       String,
  policyNumber:     String,   // insurance policy number
  beneficiaryName:  String,   // name on card

  // Employer details (only for employer source)
  employerName:     String,   // company name
  employeeId:       String,   // employee ID / staff ID
  designation:      String,   // job role

  // Insurer / TPA
  insurerName:      String,   // "Star Health" / "United India" / "New India Assurance"
  tpaName:          String,   // Third Party Administrator name
  tpaPhone:         String,

  // Coverage
  coverageAmount:   Number,   // total sum insured ₹
  roomRentLimit:    Number,   // per day room rent cap ₹
  familyCovered:    { type: Boolean, default: false },
  familyMembers:    [String], // names of covered dependents

  // Validity
  validFrom:        Date,
  validUntil:       Date,

  // Misc
  hospitalNetwork:  String,   // "Cashless at 5000+ hospitals"
  claimProcess:     String,   // "Cashless / Reimbursement"
  helplineNumber:   String,
  notes:            String,

  isActive:         { type: Boolean, default: true },
  addedAt:          { type: Date, default: Date.now },
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
  notes: String,
});

const patientSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uid:     { type: String, unique: true, default: generatePatientUID },
  qrCode:  { type: String },

  firstName:    { type: String, required: true },
  lastName:     { type: String, required: true },
  dateOfBirth:  Date,
  gender:       { type: String, enum: ['male', 'female', 'other'] },
  phone:        String,
  address: {
    street: String, city: String, state: String, pincode: String,
    country: { type: String, default: 'India' },
  },
  profilePhoto: String,

  emergency: {
    bloodGroup:               { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
    allergies:                [String],
    chronicConditions:        [String],
    currentMedications:       [String],
    emergencyContactName:     String,
    emergencyContactPhone:    String,
    emergencyContactRelation: String,
    aadhaarNumber:            String,
    organDonor:               { type: Boolean, default: false },
  },

  medicalHistory: [{
    date: Date, diagnosis: String, treatment: String,
    hospital: String, doctor: String, notes: String,
  }],

  documents:        [medicalDocumentSchema],

  // Unified medical benefits (govt + employer + personal)
  medicalBenefits:  [medicalBenefitSchema],

  // Legacy field — kept for backward compat, new data goes to medicalBenefits
  governmentBenefits: [{
    type:            { type: String, enum: ['ayushman', 'esi', 'cghs', 'state', 'insurance', 'other'] },
    schemeName:      String,
    cardNumber:      String,
    beneficiaryName: String,
    coverageAmount:  Number,
    validFrom:       Date,
    validUntil:      Date,
    isActive:        { type: Boolean, default: true },
  }],

  insurancePolicies: [{
    policyNumber: String, agencyName: String, planName: String,
    coverageAmount: Number, premium: Number, validUntil: Date,
    agentName: String, agentPhone: String,
  }],

  trustedDoctors:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' }],
  trustedHospitals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' }],
  qrActive:         { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

patientSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

module.exports = mongoose.model('Patient', patientSchema);