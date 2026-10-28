const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { connectDB, getMarketplaceConn } = require('./config/db');
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || require('path').join(__dirname, '.env') });

const app = express();

let marketplaceConnection;
let authRuntime;
let organizationRuntime;
let patientRuntime;
const {createPatientRuntime}=require('./src/patients/runtime');
const {createOrganizationRuntime}=require('./src/organizations/runtime');
const {startAuthRuntime}=require('./src/auth/runtime');
async function startServer() {
  await connectDB();
  marketplaceConnection = getMarketplaceConn();
  await marketplaceConnection.asPromise();
  authRuntime=await startAuthRuntime();
  organizationRuntime=createOrganizationRuntime(authRuntime);
  patientRuntime=createPatientRuntime(authRuntime,organizationRuntime);


  // Robust CORS configuration for Vercel/Production
  const allowedOrigins = [
    (process.env.CLIENT_URL || 'https://frontend-dun-five-15.vercel.app').replace(/\/$/, ''),
    'https://frontend-dun-five-15.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001'
  ];

  app.use(cors({
    origin: function (origin, callback) {
      if (authRuntime.mode === 'postgres') return callback(null, !origin || authRuntime.http.origins.includes(origin));
      const normalizedOrigin = (origin || '').toLowerCase().replace(/\/$/, '');

      // 1. Allow internal requests (no origin)
      if (!origin) return callback(null, true);

      // 2. Allow any Vercel subdomain
      if (origin.endsWith('.vercel.app')) return callback(null, true);

      // 3. Allow any localhost/127.0.0.1 for development
      if (normalizedOrigin.includes('localhost') || normalizedOrigin.includes('127.0.0.1')) {
        return callback(null, true);
      }

      // 4. Allow explicitly listed origins (production)
      const isAllowed = allowedOrigins.some(ao => ao.toLowerCase().replace(/\/$/, '') === normalizedOrigin);

      if (isAllowed) {
        return callback(null, true);
      }

      console.warn('🛑 CORS Blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Mediid-CSRF'],
    credentials: true,
    optionsSuccessStatus: 204
  }));

  // Explicit OPTIONS preflight handling
  // CORS middleware above handles OPTIONS using the same exact origin policy.
  // Authentication never needs the upload-sized business API body allowance.
  app.use('/api/auth',
    express.json({ limit: '16kb' }),
    express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 100 }),
    (error, req, res, next) => {
      const oversized = error?.type === 'entity.too.large' || error?.type === 'parameters.too.many';
      res.status(oversized ? 413 : 400).set('Cache-Control', 'no-store')
        .json({ message: oversized ? 'Authentication request is too large.' : 'Invalid authentication request.' });
    });
  if (organizationRuntime.mode === 'postgres') {
    app.use(['/api/hospitals','/api/doctors','/api/staff','/api/doctor-portal/availability-templates'],
      express.json({limit:'256kb'}),
      express.urlencoded({extended:false,limit:'256kb',parameterLimit:100}),
      (error,req,res,next)=>res.status(error?.type==='entity.too.large'?413:400).json({message:'Invalid provider request.'}));
  }
  if (patientRuntime.mode === 'postgres') {
    app.use('/api/patients',express.json({limit:'256kb'}),
      express.urlencoded({extended:false,limit:'256kb',parameterLimit:100}),
      (error,req,res,next)=>res.status(error?.type==='entity.too.large'||error?.type==='parameters.too.many'?413:400)
        .set('Cache-Control','no-store').json({code:'PATIENT_INPUT',message:'Invalid patient request.'}));
  }
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Routes
  if (authRuntime.mode === 'postgres') {
    app.use('/api/auth', require('./src/auth/http').createAuthRouter(authRuntime));
  } else {
    app.get('/api/auth/config', (req,res) => res.json({backend:'legacy'}));
    app.use('/api/auth', require('./routes/auth'));
  }
  app.get('/api/patients/config',(req,res)=>res.set('Cache-Control','no-store').json({backend:patientRuntime.mode}));
  if (patientRuntime.mode === 'postgres') {
    app.use('/api/patients',require('./src/patients/http').createPatientRouter(authRuntime,patientRuntime.service));
  } else {
    app.use('/api/patients',require('./routes/patients'));
  }
  app.get('/api/organizations/config',(req,res)=>res.set('Cache-Control','no-store').json({backend:organizationRuntime.mode}));
  if (organizationRuntime.mode === 'postgres') {
    app.use('/api',require('./src/organizations/http').createOrganizationRouter(authRuntime,organizationRuntime.service));
  } else {
    app.use('/api/hospitals', require('./routes/hospitals'));
    app.use('/api/doctors', require('./routes/doctors'));
    app.use('/api/staff', require('./routes/staff'));
  }
  app.use('/api/appointments', require('./routes/appointments'));
  app.use('/api/insurance', require('./routes/insurance'));
  app.use('/api/reports', require('./routes/reports'));
  app.use('/api/ocr', require('./routes/ocr'));
  app.use('/api/hospital-admin', require('./routes/hospitalAdmin'));
  if (organizationRuntime.mode === 'postgres') {
    // Only the provider template routes above are migrated. No virtual capacity or EHR fallback.
    app.use('/api/doctor-portal',(req,res)=>res.status(503).json({code:'AUTH_DOMAIN_NOT_MIGRATED',message:'This account is not available in this service yet.'}));
  } else {
    app.use('/api/doctor-portal',require('./routes/doctorPortal'));
  }
  app.use('/api/pharmacy-portal', require('./routes/pharmacyPortal'));
  app.use('/api/marketplace', require('./routes/marketplace'));
  app.use('/api/blood-requests', require('./routes/bloodRequests'));
  app.use('/api/medicine-orders', require('./routes/medicineOrders'));

  app.get('/api/health', (req, res) => res.json({ status: 'MediID API running', timestamp: new Date() }));

  // Manual Seeding Route - Visit this ONCE after deployment to create dummy users
  app.get('/api/seed', async (req, res) => {
    if(authRuntime.mode==='postgres'||process.env.NODE_ENV==='production')return res.sendStatus(404);
    try {
      const result = await seedData();
      res.json({ message: 'Seeding process completed', details: result });
    } catch (err) {
      console.error('❌ Manual seed failed:', err);
      res.status(500).json({ error: 'Seed failed', message: err.message });
    }
  });

  app.use((error,req,res,next)=>{res.status(error?.type==='entity.parse.failed'?400:503).json({message:'Request could not be processed.'});});

  const seedData = require('./seed');
  const User = require('./models/User');

  const http = require('http');
  const server = http.createServer(app);
  const PORT = process.env.PORT || 5000;
  const listen = require('./config/listen');
  await listen(server, PORT, process.env.HOST || undefined);

  const { initSocket } = require('./utils/socket');
  if(authRuntime.mode==='legacy')initSocket(server); // PG sockets await session-aware business authorization.
  const { initScheduler } = require('./utils/scheduler');
  initScheduler();
  for (const signal of ['SIGTERM','SIGINT']) process.once(signal, async()=>{server.close();await authRuntime.stop();await Promise.allSettled([mongoose.disconnect(),marketplaceConnection?.close()]);process.exit(0);});
  console.log('MediID Server running on port ' + server.address().port);

}

startServer().catch(async (error) => {
  console.error('MediID startup failed:', error.name==='AuthError'?'Authentication is unavailable.':error.message);
  await Promise.allSettled([authRuntime?.stop(), mongoose.disconnect(), marketplaceConnection?.close()]);
  process.exitCode = 1;
});

module.exports = app;
