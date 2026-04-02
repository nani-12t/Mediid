const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config();

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/patients',     require('./routes/patients'));
app.use('/api/hospitals',    require('./routes/hospitals'));
app.use('/api/doctors',      require('./routes/doctors'));
app.use('/api/staff',        require('./routes/staff'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/insurance',    require('./routes/insurance'));
app.use('/api/reports',      require('./routes/reports'));

app.get('/api/health', (req, res) => res.json({ status: 'MediID API running', timestamp: new Date() }));

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mediid')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 MediID Server running on port ${PORT}`);
  console.log(`📋 ID Format: Patient=MID-XXXXXXXX | Hospital=HID-XXXXXXXX | Doctor=HID-XXXX-DOC-0001 | Staff=HID-XXXX-STF-0001`);
});

module.exports = app;
