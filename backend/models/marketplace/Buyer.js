const mongoose = require('mongoose');
const { getMarketplaceConn } = require('../../config/db');

const buyerSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, required: true }, // Ref to User in primary DB
  companyName: { type: String, required: true },
  description: String,
  website: String,
  phone: String,
  address: String,
  createdAt: { type: Date, default: Date.now }
});

const marketplaceConn = getMarketplaceConn();
module.exports = marketplaceConn.model('Buyer', buyerSchema);
