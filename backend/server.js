const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { connectDB, getMarketplaceConn } = require('./config/db');
dotenv.config();

const app = express();

// Connect to Databases
connectDB();
getMarketplaceConn();


// Robust CORS configuration for Vercel/Production
const allowedOrigins = [
  (process.env.CLIENT_URL || 'https://frontend-dun-five-15.vercel.app').replace(/\/$/, ''),
  'https://frontend-dun-five-15.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    // 1. Allow internal requests (no origin)
    if (!origin) return callback(null, true);

    // 2. Allow any Vercel subdomain
    if (origin.endsWith('.vercel.app')) return callback(null, true);

    // 3. Allow explicitly listed origins (local + production)
    const normalizedOrigin = (origin || '').toLowerCase().replace(/\/$/, '');
    const isAllowed = allowedOrigins.some(ao => ao.toLowerCase().replace(/\/$/, '') === normalizedOrigin);

    if (isAllowed) {
      return callback(null, true);
    }

    console.warn('🛑 CORS Blocked origin:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: true,
  optionsSuccessStatus: 204
}));

// Explicit OPTIONS preflight handling
app.options('*', cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/patients', require('./routes/patients'));
app.use('/api/hospitals', require('./routes/hospitals'));
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/insurance', require('./routes/insurance'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/ocr', require('./routes/ocr'));
app.use('/api/marketplace', require('./routes/marketplace'));

app.get('/api/health', (req, res) => res.json({ status: 'MediID API running', timestamp: new Date() }));

// Manual Seeding Route - Visit this ONCE after deployment to create dummy users
app.get('/api/seed', async (req, res) => {
  try {
    const result = await seedData();
    res.json({ message: 'Seeding process completed', details: result });
  } catch (err) {
    console.error('❌ Manual seed failed:', err);
    res.status(500).json({ error: 'Seed failed', message: err.message });
  }
});

const seedData = require('./seed');
const User = require('./models/User');

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 MediID Server running on port ${PORT}`);
  console.log(`📋 ID Format: Patient=MID-XXXXXXXX | Hospital=HID-XXXXXXXX | Doctor=HID-XXXX-DOC-0001 | Staff=HID-XXXX-STF-0001`);
});

module.exports = app;
