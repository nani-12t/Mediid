const mongoose = require('mongoose');
const { getMarketplaceConn } = require('../../config/db');

const requirementSchema = new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'Buyer', required: true },
  title: { type: String, required: true },
  amount: { type: String, required: true }, // e.g., "500 patients"
  dataNeeded: { type: String, required: true }, // e.g., "ecg reports"
  description: { type: String, required: true },
  
  // Custom pricing for different document types (Simulated/Frontend info)
  pricing: {
    prescriptions: { type: Number, default: 0 },
    scans: { type: Number, default: 0 },
    xrays: { type: Number, default: 0 },
    labReports: { type: Number, default: 0 }
  },

  // Document types the buyer is looking for
  requiredDocs: [{ 
    type: String, 
    enum: ['prescriptions', 'scans', 'xrays', 'labReports', 'images'] 
  }],

  status: { type: String, enum: ['active', 'closed', 'completed'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Requirement', requirementSchema);
