const mongoose = require('mongoose');
const { getMarketplaceConn } = require('../../config/db');

const submissionSchema = new mongoose.Schema({
  requirement: { type: mongoose.Schema.Types.ObjectId, ref: 'Requirement', required: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, required: true }, // Ref to User/Patient in primary DB
  patientName: String,
  
  documents: [{
    type: { type: String, enum: ['prescriptions', 'scans', 'xrays', 'labReports', 'images'] },
    fileUrl: String,
    fileName: String,
    uploadedAt: { type: Date, default: Date.now }
  }],

  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'paid'], default: 'pending' },
  payoutAmount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Submission', submissionSchema);
