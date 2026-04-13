const mongoose = require('mongoose');

const buyerSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Ref to primary User
  companyName: { type: String, required: true },
  description: String,
  website: String,
  phone: String,
  address: String,
  createdAt: { type: Date, default: Date.now }
}, {
  collection: 'buyers',
  timestamps: true
});

module.exports = mongoose.model('Buyer', buyerSchema);
