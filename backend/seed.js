/**
 * MediID — Sample Database Seed Script
 * ======================================
 * Run: node seed.js
 *
 * This creates:
 *  ✅ 2 Hospital Admins  (Apollo Chennai, Fortis Delhi)
 *  ✅ 2 Hospitals        with full profile, specialties, facilities
 *  ✅ 8 Doctors          4 per hospital, with QR codes tied to hospital ID
 *  ✅ 6 Staff members    3 per hospital, with QR codes tied to hospital ID
 *  ✅ 3 Patients         with full medical history, documents, govt benefits
 *  ✅ 6 Appointments     mix of pending, confirmed, completed
 *
 * Login Credentials:
 * ------------------
 * Hospital Admin 1:  hospital1@apollo.com   / Test@1234
 * Hospital Admin 2:  hospital2@fortis.com   / Test@1234
 * Patient 1:         arjun@patient.com      / Test@1234
 * Patient 2:         priya@patient.com      / Test@1234
 * Patient 3:         ramesh@patient.com     / Test@1234
 */

require('dotenv').config();
const mongoose = require('mongoose');

const User        = require('./models/User');
const Hospital    = require('./models/Hospital');
const Doctor      = require('./models/Doctor');
const Staff       = require('./models/Staff');
const Patient     = require('./models/Patient');
const Appointment = require('./models/Appointment');

const {
  generateHospitalIDAndQR,
  generateDoctorIDAndQR,
  generateStaffIDAndQR,
  generatePatientIDAndQR
} = require('./utils/idGenerator');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mediid';

// ─── Helpers ────────────────────────────────────────────────────────────────
const daysFromNow = (n) => new Date(Date.now() + n * 86400000);
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

// ─── Main Seed Function ─────────────────────────────────────────────────────
async function seedData() {
  // Check if seeding is already done
  try {
    const existingUsers = await User.countDocuments();
    if (existingUsers > 0) {
      console.log('✅ Database already seeded. Skipping...');
      return { success: true, message: 'Database already has data. Skipping seed.' };
    }
  } catch (err) {
    console.error('❌ Error checking for existing data:', err.message);
  }

  // Clear existing data (extra safety for Vercel)
  console.log('\n🗑️  Clearing existing seed data...');
  await User.deleteMany({});
  await Hospital.deleteMany({});
  await Doctor.deleteMany({});
  await Staff.deleteMany({});
  await Patient.deleteMany({});
  await Appointment.deleteMany({});
  console.log('   Done.\n');

  // ═══════════════════════════════════════════════════════════
  // HOSPITAL 1 — Apollo Hospitals, Chennai
  // ═══════════════════════════════════════════════════════════
  console.log('🏥 Creating Hospital 1: Apollo Hospitals Chennai...');

  const h1User = await User.create({
    email: 'hospital1@apollo.com',
    password: 'Test@1234',
    role: 'hospital_admin'
  }); 

  const { uid: h1uid, qrCode: h1qr } = await generateHospitalIDAndQR({
    name: 'Apollo Hospitals Chennai',
    email: 'hospital1@apollo.com'
  });

  const hospital1 = await Hospital.create({
    user: h1User._id,
    uid: h1uid,
    qrCode: h1qr,
    name: 'Apollo Hospitals',
    registrationNumber: 'TN-HOSP-2001-0042',
    type: 'private',
    address: {
      street: '21 Greams Lane, Thousand Lights',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600006',
      coordinates: { lat: 13.0607, lng: 80.2496 }
    },
    contact: {
      phone: '+91-44-28293333',
      email: 'info@apollochennai.com',
      website: 'https://apollohospitals.com',
      emergencyPhone: '+91-44-28293300'
    },
    specialties: ['Cardiology', 'Oncology', 'Neurology', 'Organ Transplant', 'Orthopaedics', 'Robotic Surgery'],
    facilities: ['24/7 Emergency', 'ICU', 'NICU', 'Blood Bank', 'Pharmacy', 'Radiology', 'Cath Lab', 'CSSD'],
    operatingHours: {
      weekdays: { open: '00:00', close: '23:59' },
      weekends: { open: '00:00', close: '23:59' },
      is24x7: true
    },
    totalBeds: 560,
    icuBeds: 80,
    accreditations: ['NABH', 'JCI', 'ISO 9001:2015'],
    rating: { average: 4.8, count: 12400 },
    isVerified: true,
    doctorSequence: 0,
    staffSequence: 0
  });
  console.log(`   ✅ Hospital ID: ${h1uid}`);

  // ── Doctors for Hospital 1 ──────────────────────────────────
  console.log('   👨‍⚕️ Adding doctors...');
  const h1doctors = [];

  const docData1 = [
    {
      firstName: 'Rajesh', lastName: 'Kumar',
      specialization: 'Cardiology',
      qualifications: ['MBBS', 'MD (Medicine)', 'DM (Cardiology)', 'FACC'],
      experience: 18, consultationFee: 800,
      phone: '+91-9876543210', email: 'dr.rajesh@apollo.com',
      expertise: ['Angioplasty', 'Bypass Surgery', 'Echocardiography', 'Heart Failure Management'],
      languages: ['Tamil', 'English', 'Hindi'],
      availability: [
        { day: 'Monday',    startTime: '09:00', endTime: '13:00', maxAppointments: 20 },
        { day: 'Wednesday', startTime: '09:00', endTime: '13:00', maxAppointments: 20 },
        { day: 'Friday',    startTime: '14:00', endTime: '18:00', maxAppointments: 15 }
      ],
      rating: { average: 4.9, count: 1240 }, status: 'available'
    },
    {
      firstName: 'Priya', lastName: 'Venkataraman',
      specialization: 'Neurology',
      qualifications: ['MBBS', 'MD (Medicine)', 'DM (Neurology)', 'FIAN'],
      experience: 14, consultationFee: 750,
      phone: '+91-9876543211', email: 'dr.priya@apollo.com',
      expertise: ['Epilepsy', 'Stroke Management', 'Migraine', 'Parkinson\'s Disease', 'Dementia'],
      languages: ['Tamil', 'English'],
      availability: [
        { day: 'Tuesday',   startTime: '10:00', endTime: '14:00', maxAppointments: 15 },
        { day: 'Thursday',  startTime: '10:00', endTime: '14:00', maxAppointments: 15 },
        { day: 'Saturday',  startTime: '09:00', endTime: '12:00', maxAppointments: 10 }
      ],
      rating: { average: 4.8, count: 980 }, status: 'available'
    },
    {
      firstName: 'Suresh', lastName: 'Iyer',
      specialization: 'Oncology',
      qualifications: ['MBBS', 'MS (General Surgery)', 'MCh (Surgical Oncology)', 'FACS'],
      experience: 22, consultationFee: 1000,
      phone: '+91-9876543212', email: 'dr.suresh@apollo.com',
      expertise: ['Breast Cancer', 'GI Oncology', 'Robotic Cancer Surgery', 'Laparoscopic Oncosurgery'],
      languages: ['Tamil', 'English', 'Telugu'],
      availability: [
        { day: 'Monday',    startTime: '14:00', endTime: '18:00', maxAppointments: 10 },
        { day: 'Thursday',  startTime: '09:00', endTime: '13:00', maxAppointments: 10 },
        { day: 'Friday',    startTime: '09:00', endTime: '12:00', maxAppointments: 8  }
      ],
      rating: { average: 4.9, count: 760 }, status: 'available'
    },
    {
      firstName: 'Ananya', lastName: 'Krishnaswamy',
      specialization: 'Orthopaedics',
      qualifications: ['MBBS', 'MS (Orthopaedics)', 'Fellowship in Joint Replacement'],
      experience: 12, consultationFee: 700,
      phone: '+91-9876543213', email: 'dr.ananya@apollo.com',
      expertise: ['Knee Replacement', 'Hip Replacement', 'Spine Surgery', 'Sports Medicine', 'Arthroscopy'],
      languages: ['Tamil', 'English', 'Kannada'],
      availability: [
        { day: 'Tuesday',   startTime: '09:00', endTime: '13:00', maxAppointments: 18 },
        { day: 'Wednesday', startTime: '14:00', endTime: '18:00', maxAppointments: 18 },
        { day: 'Saturday',  startTime: '10:00', endTime: '13:00', maxAppointments: 12 }
      ],
      rating: { average: 4.7, count: 870 }, status: 'busy'
    }
  ];

  for (let i = 0; i < docData1.length; i++) {
    const updH = await Hospital.findByIdAndUpdate(hospital1._id, { $inc: { doctorSequence: 1 } }, { new: true });
    const { uid, qrCode } = await generateDoctorIDAndQR(h1uid, updH.doctorSequence, {
      name: `Dr. ${docData1[i].firstName} ${docData1[i].lastName}`,
      specialization: docData1[i].specialization,
      hospitalName: hospital1.name
    });
    const doc = await Doctor.create({ ...docData1[i], hospital: hospital1._id, uid, qrCode });
    await Hospital.findByIdAndUpdate(hospital1._id, { $push: { doctors: doc._id } });
    h1doctors.push(doc);
    console.log(`      ✅ ${uid} — Dr. ${docData1[i].firstName} ${docData1[i].lastName} (${docData1[i].specialization})`);
  }

  // ── Staff for Hospital 1 ────────────────────────────────────
  console.log('   👥 Adding staff...');
  const staffData1 = [
    { firstName: 'Meena', lastName: 'Selvam', role: 'nurse', department: 'Cardiology ICU', qualifications: ['B.Sc Nursing', 'Critical Care Certification'], experience: 8, phone: '+91-9876501001', email: 'meena@apollo.com', shift: 'morning', dateOfJoining: daysAgo(730) },
    { firstName: 'Karthik', lastName: 'Rajan', role: 'lab_technician', department: 'Pathology', qualifications: ['B.Sc MLT', 'DMLT'], experience: 5, phone: '+91-9876501002', email: 'karthik@apollo.com', shift: 'morning', dateOfJoining: daysAgo(540) },
    { firstName: 'Sowmya', lastName: 'Pillai', role: 'receptionist', department: 'OPD', qualifications: ['B.Com', 'Hospital Management Diploma'], experience: 3, phone: '+91-9876501003', email: 'sowmya@apollo.com', shift: 'morning', dateOfJoining: daysAgo(400) }
  ];

  for (let i = 0; i < staffData1.length; i++) {
    const updH = await Hospital.findByIdAndUpdate(hospital1._id, { $inc: { staffSequence: 1 } }, { new: true });
    const { uid, qrCode } = await generateStaffIDAndQR(h1uid, updH.staffSequence, {
      name: `${staffData1[i].firstName} ${staffData1[i].lastName}`,
      role: staffData1[i].role,
      hospitalName: hospital1.name
    });
    const s = await Staff.create({ ...staffData1[i], hospital: hospital1._id, uid, qrCode });
    await Hospital.findByIdAndUpdate(hospital1._id, { $push: { staff: s._id } });
    console.log(`      ✅ ${uid} — ${staffData1[i].firstName} ${staffData1[i].lastName} (${staffData1[i].role})`);
  }

  // ═══════════════════════════════════════════════════════════
  // HOSPITAL 2 — Fortis Hospital, Delhi
  // ═══════════════════════════════════════════════════════════
  console.log('\n🏥 Creating Hospital 2: Fortis Hospital Delhi...');

  const h2User = await User.create({
    email: 'hospital2@fortis.com',
    password: 'Test@1234',
    role: 'hospital_admin'
  });

  const { uid: h2uid, qrCode: h2qr } = await generateHospitalIDAndQR({
    name: 'Fortis Hospital Delhi',
    email: 'hospital2@fortis.com'
  });

  const hospital2 = await Hospital.create({
    user: h2User._id,
    uid: h2uid,
    qrCode: h2qr,
    name: 'Fortis Memorial Research Institute',
    registrationNumber: 'DL-HOSP-2002-0118',
    type: 'private',
    address: {
      street: 'Sector 44, Opposite HUDA City Centre',
      city: 'Gurugram',
      state: 'Haryana',
      pincode: '122002',
      coordinates: { lat: 28.4595, lng: 77.0266 }
    },
    contact: {
      phone: '+91-124-4921021',
      email: 'info@fortisdelhincr.com',
      website: 'https://fortishealthcare.com',
      emergencyPhone: '+91-124-4921000'
    },
    specialties: ['Bone Marrow Transplant', 'Kidney Transplant', 'Paediatrics', 'Gynaecology', 'Neurosurgery', 'Urology'],
    facilities: ['24/7 Emergency', 'Level 1 Trauma', 'PICU', 'NICU', 'Bone Marrow Transplant Unit', 'Dialysis', 'Cathlab', 'MRI 3 Tesla'],
    operatingHours: {
      weekdays: { open: '00:00', close: '23:59' },
      weekends: { open: '00:00', close: '23:59' },
      is24x7: true
    },
    totalBeds: 460,
    icuBeds: 65,
    accreditations: ['NABH', 'NABL', 'JCI'],
    rating: { average: 4.7, count: 9800 },
    isVerified: true,
    doctorSequence: 0,
    staffSequence: 0
  });
  console.log(`   ✅ Hospital ID: ${h2uid}`);

  // ── Doctors for Hospital 2 ──────────────────────────────────
  console.log('   👨‍⚕️ Adding doctors...');
  const h2doctors = [];

  const docData2 = [
    {
      firstName: 'Vikram', lastName: 'Mehta',
      specialization: 'Neurosurgery',
      qualifications: ['MBBS', 'MS (General Surgery)', 'MCh (Neurosurgery)', 'FRCS'],
      experience: 20, consultationFee: 1200,
      phone: '+91-9876543220', email: 'dr.vikram@fortis.com',
      expertise: ['Brain Tumour Surgery', 'Spine Surgery', 'Deep Brain Stimulation', 'Minimally Invasive Neurosurgery'],
      languages: ['Hindi', 'English', 'Punjabi'],
      availability: [
        { day: 'Monday',    startTime: '10:00', endTime: '14:00', maxAppointments: 8  },
        { day: 'Wednesday', startTime: '10:00', endTime: '14:00', maxAppointments: 8  },
        { day: 'Friday',    startTime: '10:00', endTime: '13:00', maxAppointments: 6  }
      ],
      rating: { average: 4.9, count: 620 }, status: 'available'
    },
    {
      firstName: 'Sunita', lastName: 'Sharma',
      specialization: 'Paediatrics',
      qualifications: ['MBBS', 'MD (Paediatrics)', 'Fellowship Neonatology', 'IAP'],
      experience: 16, consultationFee: 600,
      phone: '+91-9876543221', email: 'dr.sunita@fortis.com',
      expertise: ['Neonatology', 'Paediatric Intensive Care', 'Developmental Paediatrics', 'Vaccination'],
      languages: ['Hindi', 'English'],
      availability: [
        { day: 'Tuesday',   startTime: '09:00', endTime: '13:00', maxAppointments: 25 },
        { day: 'Thursday',  startTime: '09:00', endTime: '13:00', maxAppointments: 25 },
        { day: 'Saturday',  startTime: '09:00', endTime: '12:00', maxAppointments: 15 }
      ],
      rating: { average: 4.8, count: 1100 }, status: 'available'
    },
    {
      firstName: 'Arun', lastName: 'Gupta',
      specialization: 'Urology',
      qualifications: ['MBBS', 'MS (General Surgery)', 'MCh (Urology)', 'Fellowship Robotic Surgery'],
      experience: 17, consultationFee: 900,
      phone: '+91-9876543222', email: 'dr.arun@fortis.com',
      expertise: ['Robotic Prostatectomy', 'Kidney Stone Management', 'Laparoscopic Nephrectomy', 'Bladder Cancer'],
      languages: ['Hindi', 'English', 'Gujarati'],
      availability: [
        { day: 'Monday',    startTime: '14:00', endTime: '18:00', maxAppointments: 12 },
        { day: 'Thursday',  startTime: '14:00', endTime: '18:00', maxAppointments: 12 },
        { day: 'Friday',    startTime: '09:00', endTime: '13:00', maxAppointments: 10 }
      ],
      rating: { average: 4.7, count: 540 }, status: 'available'
    },
    {
      firstName: 'Neha', lastName: 'Kapoor',
      specialization: 'Gynaecology',
      qualifications: ['MBBS', 'MS (Obstetrics & Gynaecology)', 'Fellowship Laparoscopic Surgery'],
      experience: 13, consultationFee: 700,
      phone: '+91-9876543223', email: 'dr.neha@fortis.com',
      expertise: ['High Risk Pregnancy', 'Laparoscopic Hysterectomy', 'Infertility Management', 'PCOS'],
      languages: ['Hindi', 'English', 'Marathi'],
      availability: [
        { day: 'Monday',    startTime: '09:00', endTime: '13:00', maxAppointments: 20 },
        { day: 'Wednesday', startTime: '14:00', endTime: '18:00', maxAppointments: 20 },
        { day: 'Saturday',  startTime: '09:00', endTime: '13:00', maxAppointments: 15 }
      ],
      rating: { average: 4.8, count: 890 }, status: 'on_leave'
    }
  ];

  for (let i = 0; i < docData2.length; i++) {
    const updH = await Hospital.findByIdAndUpdate(hospital2._id, { $inc: { doctorSequence: 1 } }, { new: true });
    const { uid, qrCode } = await generateDoctorIDAndQR(h2uid, updH.doctorSequence, {
      name: `Dr. ${docData2[i].firstName} ${docData2[i].lastName}`,
      specialization: docData2[i].specialization,
      hospitalName: hospital2.name
    });
    const doc = await Doctor.create({ ...docData2[i], hospital: hospital2._id, uid, qrCode });
    await Hospital.findByIdAndUpdate(hospital2._id, { $push: { doctors: doc._id } });
    h2doctors.push(doc);
    console.log(`      ✅ ${uid} — Dr. ${docData2[i].firstName} ${docData2[i].lastName} (${docData2[i].specialization})`);
  }

  // ── Staff for Hospital 2 ────────────────────────────────────
  console.log('   👥 Adding staff...');
  const staffData2 = [
    { firstName: 'Ramesh', lastName: 'Yadav', role: 'nurse', department: 'Neuro ICU', qualifications: ['B.Sc Nursing', 'Neuro Critical Care'], experience: 10, phone: '+91-9876502001', email: 'ramesh@fortis.com', shift: 'night', dateOfJoining: daysAgo(900) },
    { firstName: 'Pooja', lastName: 'Tiwari', role: 'radiologist', department: 'Radiology & Imaging', qualifications: ['B.Sc Radiology', 'MRI & CT Certification'], experience: 7, phone: '+91-9876502002', email: 'pooja@fortis.com', shift: 'morning', dateOfJoining: daysAgo(600) },
    { firstName: 'Deepak', lastName: 'Nair', role: 'pharmacist', department: 'Hospital Pharmacy', qualifications: ['B.Pharm', 'M.Pharm (Clinical)'], experience: 9, phone: '+91-9876502003', email: 'deepak@fortis.com', shift: 'rotational', dateOfJoining: daysAgo(720) }
  ];

  for (let i = 0; i < staffData2.length; i++) {
    const updH = await Hospital.findByIdAndUpdate(hospital2._id, { $inc: { staffSequence: 1 } }, { new: true });
    const { uid, qrCode } = await generateStaffIDAndQR(h2uid, updH.staffSequence, {
      name: `${staffData2[i].firstName} ${staffData2[i].lastName}`,
      role: staffData2[i].role,
      hospitalName: hospital2.name
    });
    const s = await Staff.create({ ...staffData2[i], hospital: hospital2._id, uid, qrCode });
    await Hospital.findByIdAndUpdate(hospital2._id, { $push: { staff: s._id } });
    console.log(`      ✅ ${uid} — ${staffData2[i].firstName} ${staffData2[i].lastName} (${staffData2[i].role})`);
  }

  // ═══════════════════════════════════════════════════════════
  // PATIENTS
  // ═══════════════════════════════════════════════════════════
  console.log('\n🧑‍⚕️ Creating Patients...');

  // Patient 1 — Arjun Sharma
  const p1User = await User.create({
    email: 'arjun@patient.com',
    password: 'Test@1234',
    role: 'patient'
  });
  const { uid: p1uid, qrCode: p1qr } = await generatePatientIDAndQR({ name: 'Arjun Sharma', email: 'arjun@patient.com' });
  const patient1 = await Patient.create({
    user: p1User._id,
    uid: p1uid,
    qrCode: p1qr,
    firstName: 'Arjun',
    lastName: 'Sharma',
    dateOfBirth: new Date('1990-04-15'),
    gender: 'male',
    phone: '+91-9988776655',
    address: { street: '14 Anna Nagar East', city: 'Chennai', state: 'Tamil Nadu', pincode: '600102' },
    emergency: {
      bloodGroup: 'B+',
      allergies: ['Penicillin', 'Sulfa drugs'],
      chronicConditions: ['Type 2 Diabetes', 'Mild Hypertension'],
      currentMedications: ['Metformin 500mg twice daily', 'Amlodipine 5mg once daily', 'Aspirin 75mg'],
      emergencyContactName: 'Meera Sharma',
      emergencyContactPhone: '+91-9988776600',
      emergencyContactRelation: 'Spouse',
      organDonor: true
    },
    medicalHistory: [
      { date: daysAgo(365), diagnosis: 'Type 2 Diabetes Mellitus', treatment: 'Metformin 500mg BD, Lifestyle modification', hospital: 'Apollo Hospitals Chennai', doctor: 'Dr. Rajesh Kumar', notes: 'HbA1c: 8.2%, Target < 7%' },
      { date: daysAgo(180), diagnosis: 'Hypertension Stage 1', treatment: 'Amlodipine 5mg OD, Low sodium diet', hospital: 'Apollo Hospitals Chennai', doctor: 'Dr. Rajesh Kumar', notes: 'BP: 145/90 mmHg on presentation' },
      { date: daysAgo(60), diagnosis: 'Follow-up — Diabetes & HTN', treatment: 'Continue current medications', hospital: 'Apollo Hospitals Chennai', doctor: 'Dr. Rajesh Kumar', notes: 'HbA1c improved to 7.4%, BP 132/84' }
    ],
    documents: [
      { type: 'lab_report', title: 'HbA1c + Lipid Profile Jan 2025', hospitalName: 'Apollo Hospitals', doctorName: 'Dr. Rajesh Kumar', notes: 'HbA1c: 7.4%, Total Cholesterol: 198', uploadedAt: daysAgo(30) },
      { type: 'prescription', title: 'Diabetes Prescription - Mar 2025', hospitalName: 'Apollo Hospitals', doctorName: 'Dr. Rajesh Kumar', notes: 'Metformin 500mg BD, Amlodipine 5mg OD', uploadedAt: daysAgo(10) },
      { type: 'scan', title: 'ECG - Routine Check', hospitalName: 'Apollo Hospitals', doctorName: 'Dr. Rajesh Kumar', notes: 'Normal Sinus Rhythm, No ST changes', uploadedAt: daysAgo(60) }
    ],
    governmentBenefits: [
      { type: 'ayushman', schemeName: 'Ayushman Bharat PMJAY', cardNumber: 'PMJAY-TN-2024-A3F2C1B9', beneficiaryName: 'Arjun Sharma', coverageAmount: 500000, validFrom: new Date('2024-01-01'), validUntil: new Date('2025-12-31'), isActive: true }
    ],
    trustedHospitals: [hospital1._id],
    qrActive: true
  });
  console.log(`   ✅ Patient ID: ${p1uid} — Arjun Sharma`);

  // Patient 2 — Priya Nair
  const p2User = await User.create({
    email: 'priya@patient.com',
    password: 'Test@1234',
    role: 'patient'
  });
  const { uid: p2uid, qrCode: p2qr } = await generatePatientIDAndQR({ name: 'Priya Nair', email: 'priya@patient.com' });
  const patient2 = await Patient.create({
    user: p2User._id,
    uid: p2uid,
    qrCode: p2qr,
    firstName: 'Priya',
    lastName: 'Nair',
    dateOfBirth: new Date('1987-09-22'),
    gender: 'female',
    phone: '+91-9871234567',
    address: { street: '7B Vasant Vihar', city: 'New Delhi', state: 'Delhi', pincode: '110057' },
    emergency: {
      bloodGroup: 'O+',
      allergies: ['Latex', 'Ibuprofen'],
      chronicConditions: ['Migraine', 'Hypothyroidism'],
      currentMedications: ['Levothyroxine 50mcg once daily', 'Sumatriptan 50mg (as needed)'],
      emergencyContactName: 'Sunil Nair',
      emergencyContactPhone: '+91-9871234500',
      emergencyContactRelation: 'Husband',
      organDonor: false
    },
    medicalHistory: [
      { date: daysAgo(500), diagnosis: 'Hypothyroidism', treatment: 'Levothyroxine 50mcg once daily on empty stomach', hospital: 'Fortis Memorial Research Institute', doctor: 'Dr. Sunita Sharma', notes: 'TSH: 8.2 mIU/L at diagnosis' },
      { date: daysAgo(200), diagnosis: 'Chronic Migraine', treatment: 'Sumatriptan 50mg for acute attacks, Amitriptyline 10mg prophylaxis', hospital: 'Fortis Memorial Research Institute', doctor: 'Dr. Vikram Mehta', notes: '4-5 episodes per month, MRI brain normal' },
      { date: daysAgo(45), diagnosis: 'Thyroid Follow-up', treatment: 'Continue Levothyroxine, Recheck TSH after 3 months', hospital: 'Fortis Memorial Research Institute', doctor: 'Dr. Sunita Sharma', notes: 'TSH normalised to 2.8 mIU/L' }
    ],
    documents: [
      { type: 'lab_report', title: 'Thyroid Function Test Feb 2025', hospitalName: 'Fortis Hospital', doctorName: 'Dr. Sunita Sharma', notes: 'TSH: 2.8, T3: Normal, T4: Normal', uploadedAt: daysAgo(45) },
      { type: 'scan', title: 'MRI Brain - Migraine Workup', hospitalName: 'Fortis Hospital', doctorName: 'Dr. Vikram Mehta', notes: 'No structural abnormality, No space occupying lesion', uploadedAt: daysAgo(200) },
      { type: 'prescription', title: 'Neurology Prescription Jan 2025', hospitalName: 'Fortis Hospital', doctorName: 'Dr. Vikram Mehta', notes: 'Amitriptyline 10mg OD, Sumatriptan 50mg SOS', uploadedAt: daysAgo(60) }
    ],
    governmentBenefits: [
      { type: 'cghs', schemeName: 'CGHS (Central Govt. Health Scheme)', cardNumber: 'CGHS-DL-2023-P9N2K4', beneficiaryName: 'Priya Nair', coverageAmount: 300000, validFrom: new Date('2023-04-01'), validUntil: new Date('2026-03-31'), isActive: true }
    ],
    trustedHospitals: [hospital2._id],
    qrActive: true
  });
  console.log(`   ✅ Patient ID: ${p2uid} — Priya Nair`);

  // Patient 3 — Ramesh Patel
  const p3User = await User.create({
    email: 'ramesh@patient.com',
    password: 'Test@1234',
    role: 'patient'
  });
  const { uid: p3uid, qrCode: p3qr } = await generatePatientIDAndQR({ name: 'Ramesh Patel', email: 'ramesh@patient.com' });
  const patient3 = await Patient.create({
    user: p3User._id,
    uid: p3uid,
    qrCode: p3qr,
    firstName: 'Ramesh',
    lastName: 'Patel',
    dateOfBirth: new Date('1975-12-03'),
    gender: 'male',
    phone: '+91-9765432198',
    address: { street: '23 Navrangpura', city: 'Ahmedabad', state: 'Gujarat', pincode: '380009' },
    emergency: {
      bloodGroup: 'AB+',
      allergies: ['Aspirin', 'Contrast dye'],
      chronicConditions: ['Coronary Artery Disease', 'Type 2 Diabetes', 'CKD Stage 2'],
      currentMedications: ['Atorvastatin 40mg OD', 'Clopidogrel 75mg OD', 'Metformin 1000mg BD', 'Losartan 50mg OD'],
      emergencyContactName: 'Kavita Patel',
      emergencyContactPhone: '+91-9765432100',
      emergencyContactRelation: 'Wife',
      organDonor: false
    },
    medicalHistory: [
      { date: daysAgo(700), diagnosis: 'Coronary Artery Disease — NSTEMI', treatment: 'Emergency PTCA + Stenting to LAD, Dual antiplatelet therapy', hospital: 'Apollo Hospitals Chennai', doctor: 'Dr. Rajesh Kumar', notes: 'Single vessel disease, EF 48%' },
      { date: daysAgo(400), diagnosis: 'Post-MI Follow-up + Diabetes Review', treatment: 'Continue medications, Metformin increased to 1000mg BD', hospital: 'Apollo Hospitals Chennai', doctor: 'Dr. Rajesh Kumar', notes: 'EF improved to 52%, HbA1c 8.1%' },
      { date: daysAgo(90), diagnosis: 'CKD Stage 2 — Nephrology Referral', treatment: 'Losartan 50mg, Low protein diet, nephrology follow-up', hospital: 'Apollo Hospitals Chennai', doctor: 'Dr. Rajesh Kumar', notes: 'eGFR: 68 mL/min, Creatinine: 1.4' }
    ],
    documents: [
      { type: 'scan', title: 'Coronary Angiogram Report 2022', hospitalName: 'Apollo Hospitals', doctorName: 'Dr. Rajesh Kumar', notes: '70% LAD stenosis, RCA & LCx normal', uploadedAt: daysAgo(700) },
      { type: 'lab_report', title: 'Renal Function Test Mar 2025', hospitalName: 'Apollo Hospitals', doctorName: 'Dr. Rajesh Kumar', notes: 'Creatinine: 1.4, Urea: 36, eGFR: 68', uploadedAt: daysAgo(20) },
      { type: 'bill', title: 'Apollo Hospital Bill - Jan 2025', hospitalName: 'Apollo Hospitals', notes: 'Cardiology OPD + ECG + Echo — ₹3,200', uploadedAt: daysAgo(50) },
      { type: 'prescription', title: 'Cardiology Prescription Mar 2025', hospitalName: 'Apollo Hospitals', doctorName: 'Dr. Rajesh Kumar', notes: 'Atorvastatin 40mg, Clopidogrel 75mg, Losartan 50mg', uploadedAt: daysAgo(7) }
    ],
    governmentBenefits: [
      { type: 'ayushman', schemeName: 'Ayushman Bharat PMJAY', cardNumber: 'PMJAY-GJ-2024-R7M3P5', beneficiaryName: 'Ramesh Patel', coverageAmount: 500000, validFrom: new Date('2024-01-01'), validUntil: new Date('2025-12-31'), isActive: true },
      { type: 'state', schemeName: 'MA Vatsalya Yojana (Gujarat)', cardNumber: 'MAVY-GJ-2023-0048321', beneficiaryName: 'Ramesh Patel', coverageAmount: 200000, validFrom: new Date('2023-06-01'), validUntil: new Date('2025-05-31'), isActive: true }
    ],
    trustedHospitals: [hospital1._id],
    qrActive: true
  });
  console.log(`   ✅ Patient ID: ${p3uid} — Ramesh Patel`);

  // Patient 4 — teajaaravindbandaru@gmail.com
  const p4User = await User.create({
    email: 'teajaaravindbandaru@gmail.com',
    password: 'Test@1234',
    role: 'patient'
  });
  const { uid: p4uid, qrCode: p4qr } = await generatePatientIDAndQR({ name: 'Aravind Bandaru', email: 'teajaaravindbandaru@gmail.com' });
  await Patient.create({
    user: p4User._id,
    uid: p4uid,
    qrCode: p4qr,
    firstName: 'Aravind',
    lastName: 'Bandaru',
    dateOfBirth: new Date('1995-10-10'),
    gender: 'male',
    phone: '+91-9000000000',
    address: { street: 'Main Road', city: 'Hyderabad', state: 'Telangana', pincode: '500001' },
    emergency: {
      bloodGroup: 'O+',
      allergies: ['Dust'],
      chronicConditions: ['None'],
      currentMedications: ['None'],
      emergencyContactName: 'Family Member',
      emergencyContactPhone: '+91-9000000001',
      emergencyContactRelation: 'Parent',
      organDonor: true
    },
    qrActive: true
  });
  console.log(`   ✅ Patient ID: ${p4uid} — Aravind Bandaru`);

  // ═══════════════════════════════════════════════════════════
  // APPOINTMENTS
  // ═══════════════════════════════════════════════════════════
  console.log('\n📅 Creating Appointments...');

  const appointments = await Appointment.insertMany([
    // Arjun → Apollo → Dr. Rajesh (Cardiology) — CONFIRMED
    {
      patient: patient1._id, doctor: h1doctors[0]._id, hospital: hospital1._id,
      appointmentDate: daysFromNow(3), timeSlot: '10:00 AM',
      status: 'confirmed', type: 'follow_up', bookingMethod: 'app',
      symptoms: 'Routine diabetes and BP follow-up, slightly elevated sugar readings this week',
      confirmedAt: new Date(), billAmount: 800, billStatus: 'pending'
    },
    // Arjun → Apollo → Dr. Suresh (Oncology) — PENDING
    {
      patient: patient1._id, doctor: h1doctors[2]._id, hospital: hospital1._id,
      appointmentDate: daysFromNow(7), timeSlot: '02:00 PM',
      status: 'pending', type: 'consultation', bookingMethod: 'whatsapp',
      symptoms: 'Referred by Dr. Rajesh for a suspicious lymph node in neck',
      billAmount: 1000, billStatus: 'pending'
    },
    // Priya → Fortis → Dr. Vikram (Neurology) — CONFIRMED
    {
      patient: patient2._id, doctor: h2doctors[0]._id, hospital: hospital2._id,
      appointmentDate: daysFromNow(2), timeSlot: '11:00 AM',
      status: 'confirmed', type: 'follow_up', bookingMethod: 'app',
      symptoms: 'Migraine frequency increased to 6 times this month, sleep disturbance',
      confirmedAt: new Date(), billAmount: 1200, billStatus: 'pending'
    },
    // Priya → Fortis → Dr. Sunita (Paediatrics) — PENDING (for her child)
    {
      patient: patient2._id, doctor: h2doctors[1]._id, hospital: hospital2._id,
      appointmentDate: daysFromNow(5), timeSlot: '09:30 AM',
      status: 'pending', type: 'consultation', bookingMethod: 'phone',
      symptoms: 'Child (4 yr) — fever for 3 days, mild cough, runny nose',
      billAmount: 600, billStatus: 'pending'
    },
    // Ramesh → Apollo → Dr. Rajesh (Cardiology) — COMPLETED
    {
      patient: patient3._id, doctor: h1doctors[0]._id, hospital: hospital1._id,
      appointmentDate: daysAgo(15), timeSlot: '09:00 AM',
      status: 'completed', type: 'follow_up', bookingMethod: 'app',
      symptoms: 'Post-PTCA annual review, mild breathlessness on exertion',
      confirmedAt: daysAgo(20),
      prescription: { uploadedAt: daysAgo(15), notes: 'Continue all medications. Echo EF 52%. Renal review in 3 months.' },
      billAmount: 1500, billStatus: 'paid',
      staffNotes: 'Patient reviewed, echo done. Stable. Next appointment in 3 months.'
    },
    // Ramesh → Apollo → Dr. Ananya (Orthopaedics) — COMPLETED
    {
      patient: patient3._id, doctor: h1doctors[3]._id, hospital: hospital1._id,
      appointmentDate: daysAgo(45), timeSlot: '03:00 PM',
      status: 'completed', type: 'consultation', bookingMethod: 'walk_in',
      symptoms: 'Right knee pain for 2 months, difficulty climbing stairs',
      confirmedAt: daysAgo(45),
      prescription: { uploadedAt: daysAgo(45), notes: 'X-ray: Grade 2 OA knee. Physiotherapy 10 sessions. Glucosamine + Chondroitin.' },
      billAmount: 1800, billStatus: 'insurance_claimed',
      staffNotes: 'OA right knee diagnosed. X-ray done. Referred for physiotherapy.'
    }
  ]);
  console.log(`   ✅ Created ${appointments.length} appointments`);

  // ═══════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log('🎉 DATABASE SEEDED SUCCESSFULLY!');
  console.log('═'.repeat(60));

  console.log('\n🏥 HOSPITAL ADMIN LOGINS:');
  console.log('┌─────────────────────────────────────────────────────┐');
  console.log(`│ Apollo Hospitals Chennai                            │`);
  console.log(`│   Email   : hospital1@apollo.com                    │`);
  console.log(`│   Password: Test@1234                               │`);
  console.log(`│   HID     : ${h1uid}                      │`);
  console.log('│─────────────────────────────────────────────────────│');
  console.log(`│ Fortis Memorial Research Institute                  │`);
  console.log(`│   Email   : hospital2@fortis.com                    │`);
  console.log(`│   Password: Test@1234                               │`);
  console.log(`│   HID     : ${h2uid}                      │`);
  console.log('└─────────────────────────────────────────────────────┘');

  console.log('\n🧑‍⚕️ PATIENT LOGINS:');
  console.log('┌─────────────────────────────────────────────────────┐');
  console.log(`│ Arjun Sharma (Diabetes + HTN)                       │`);
  console.log(`│   Email   : arjun@patient.com                       │`);
  console.log(`│   Password: Test@1234                               │`);
  console.log(`│   MID     : ${p1uid}                      │`);
  console.log('│─────────────────────────────────────────────────────│');
  console.log(`│ Priya Nair (Migraine + Hypothyroid)                 │`);
  console.log(`│   Email   : priya@patient.com                       │`);
  console.log(`│   Password: Test@1234                               │`);
  console.log(`│   MID     : ${p2uid}                      │`);
  console.log('│─────────────────────────────────────────────────────│');
  console.log(`│ Ramesh Patel (CAD + Diabetes + CKD)                 │`);
  console.log(`│   Email   : ramesh@patient.com                      │`);
  console.log(`│   Password: Test@1234                               │`);
  console.log(`│   MID     : ${p3uid}                      │`);
  console.log('└─────────────────────────────────────────────────────┘');

  console.log('\n📊 DATA SUMMARY:');
  console.log(`   Hospitals   : 2`);
  console.log(`   Doctors     : ${h1doctors.length + h2doctors.length} (${h1doctors.length} Apollo + ${h2doctors.length} Fortis)`);
  console.log(`   Staff       : ${staffData1.length + staffData2.length} (${staffData1.length} Apollo + ${staffData2.length} Fortis)`);
  console.log(`   Patients    : 3`);
  console.log(`   Appointments: ${appointments.length} (2 confirmed, 2 pending, 2 completed)`);

  console.log('\n💡 ID FORMAT EXAMPLES:');
  console.log(`   Hospital : ${h1uid}`);
  console.log(`   Doctor   : ${h1uid}-DOC-0001`);
  console.log(`   Staff    : ${h1uid}-STF-0001`);
  console.log(`   Patient  : ${p1uid}`);
  console.log('═'.repeat(60) + '\n');

}

async function runSeed() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB:', MONGO_URI);
  await seedData();
  await mongoose.disconnect();
  process.exit(0);
}

if (require.main === module) {
  runSeed().catch(err => {
    console.error('\n❌ Seed failed:', err.message);
    console.error(err);
    process.exit(1);
  });
}

module.exports = seedData;