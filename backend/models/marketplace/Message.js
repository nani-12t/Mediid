const mongoose = require('mongoose');
const { getMarketplaceConn } = require('../../config/db');

const messageSchema = new mongoose.Schema({
  requirement: { type: mongoose.Schema.Types.ObjectId, ref: 'Requirement' },
  sender: { type: mongoose.Schema.Types.ObjectId, required: true }, // User ID
  receiver: { type: mongoose.Schema.Types.ObjectId, required: true }, // User ID
  content: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const marketplaceConn = getMarketplaceConn();
module.exports = marketplaceConn.model('Message', messageSchema);
