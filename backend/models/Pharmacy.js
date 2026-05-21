const mongoose = require('mongoose');

const pharmacySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },
  name: { type: String, default: 'Hospital Pharmacy' },
  contact: {
    email: String,
    phone: String
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Pharmacy', pharmacySchema);
