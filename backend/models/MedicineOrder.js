const mongoose = require('mongoose');

const medicineOrderItemSchema = new mongoose.Schema({
  medicineId: String,
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, default: 1 },
});

const medicineOrderSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
  },
  items: [medicineOrderItemSchema],
  totalAmount: { type: Number, required: true },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
  },
  status: {
    type: String,
    enum: ['pending', 'preparing', 'shipped', 'delivered'],
    default: 'pending',
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid'],
    default: 'pending',
  },
  paymentMethod: { type: String, default: 'Cash on Delivery' },
  prescriptionUrl: String, // Base64 encoded or path
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('MedicineOrder', medicineOrderSchema);
