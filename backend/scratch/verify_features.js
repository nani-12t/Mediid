/**
 * E2E Feature Verification Script
 * ================================
 * Validates:
 * 1. Hospital Admin registration with Govt registration number and correct ID generation format (HID-XXXX).
 * 2. Sequential Doctor recruitment and ID generation.
 * 3. Doctor account activation.
 * 4. Patient registration.
 * 5. Time-bound doctor-patient access controls (Awaiting confirmation check).
 * 6. Admin appointment confirmation.
 * 7. Time-bound doctor-patient access controls (10-minute check).
 * 8. Patient record access decryption when within appointment time window.
 * 9. Diagnostic report uploading (base64) & retrieving.
 */

const axios = require('axios');
const mongoose = require('mongoose');

const API_URL = 'http://localhost:5000/api';
const MONGO_URI = 'mongodb://localhost:27017/mediid';

async function runVerification() {
  console.log('🚀 STARTING COMPREHENSIVE HMIS FEATURE VERIFICATION...\n');

  const rand = Math.floor(Math.random() * 1000000);
  const regNumber = `GOVREG${rand}`;
  const hospitalEmail = `admin.${rand}@railwayhosp.com`;
  const hospitalPassword = 'TestPassword123!';
  
  const docEmail = `doctor.${rand}@railwayhosp.com`;
  const docPassword = 'DoctorPassword123!';

  const patientEmail = `patient.${rand}@gmail.com`;
  const patientPassword = 'PatientPassword123!';

  let hospitalToken, doctorToken, patientToken;
  let hospitalUid, doctorUid, patientUid, patientDbId, doctorDbId, hospitalDbId;
  let appointmentId;

  try {
    // Connect to database to modify data mid-test
    console.log('⏳ Connecting to Database...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB.');

    // 1. Hospital Admin Registration with Govt Registration Number
    console.log('\n⏳ 1. Registering Hospital Admin with Govt Reg Number:', regNumber);
    const registerHospRes = await axios.post(`${API_URL}/auth/register`, {
      role: 'hospital_admin',
      hospitalName: `Railway Hospital ${rand}`,
      email: hospitalEmail,
      password: hospitalPassword,
      registrationNumber: regNumber
    });
    
    hospitalUid = registerHospRes.data.profile.uid;
    hospitalDbId = registerHospRes.data.profile._id;
    console.log('✅ Registered! Hospital UID:', hospitalUid);
    if (hospitalUid !== `HID-${regNumber}`) {
      throw new Error(`Hospital ID format invalid! Expected: HID-${regNumber}, got: ${hospitalUid}`);
    }
    console.log('✅ Hospital ID matches government-derived format correctly.');

    // Login as Hospital Admin
    console.log('⏳ Logging in as Hospital Admin...');
    const loginHospRes = await axios.post(`${API_URL}/auth/login`, {
      email: hospitalEmail,
      password: hospitalPassword
    });
    hospitalToken = loginHospRes.data.token;
    console.log('✅ Hospital Admin logged in successfully.');

    // 2. Doctor Recruitment
    console.log('\n⏳ 2. Recruiting Doctor via Hospital Admin...');
    const recruitDocRes = await axios.post(`${API_URL}/doctors`, {
      firstName: 'Rajesh',
      lastName: 'Kumar',
      specialization: 'Cardiology',
      doctorType: 'Senior Doctor',
      email: docEmail,
      consultationFee: 600,
      phone: '9876543210'
    }, {
      headers: { Authorization: `Bearer ${hospitalToken}` }
    });

    doctorUid = recruitDocRes.data.uid;
    doctorDbId = recruitDocRes.data._id;
    console.log('✅ Doctor Recruited! Doctor UID:', doctorUid);
    const expectedPrefix = `HID-${regNumber}-SRDOC-`;
    if (!doctorUid.startsWith(expectedPrefix)) {
      throw new Error(`Doctor ID format invalid! Expected to start with: ${expectedPrefix}, got: ${doctorUid}`);
    }
    console.log('✅ Sequential Doctor ID generated correctly under Government Hospital ID.');

    // 3. Doctor Activation
    console.log('\n⏳ 3. Activating Doctor Account...');
    const activateDocRes = await axios.post(`${API_URL}/auth/doctor-activate`, {
      uid: doctorUid,
      password: docPassword
    });
    console.log('✅ Doctor account activated successfully.');

    // Login as Doctor
    console.log('⏳ Logging in as Doctor...');
    const loginDocRes = await axios.post(`${API_URL}/auth/login`, {
      email: doctorUid,
      password: docPassword
    });
    doctorToken = loginDocRes.data.token;
    console.log('✅ Doctor logged in successfully.');

    // 4. Patient Registration
    console.log('\n⏳ 4. Registering Patient...');
    const registerPatientRes = await axios.post(`${API_URL}/auth/register`, {
      role: 'patient',
      firstName: 'Arjun',
      lastName: 'Prasad',
      email: patientEmail,
      password: patientPassword
    });
    patientUid = registerPatientRes.data.profile.uid;
    patientDbId = registerPatientRes.data.profile._id;
    console.log('✅ Patient Registered! Patient UID:', patientUid);

    // Login as Patient
    console.log('⏳ Logging in as Patient...');
    const loginPatientRes = await axios.post(`${API_URL}/auth/login`, {
      email: patientEmail,
      password: patientPassword
    });
    patientToken = loginPatientRes.data.token;
    console.log('✅ Patient logged in successfully.');

    // 5. Book Appointment
    console.log('\n⏳ 5. Booking Appointment with Doctor...');
    const bookRes = await axios.post(`${API_URL}/appointments`, {
      hospital: hospitalDbId,
      doctor: doctorDbId,
      appointmentDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], // tomorrow
      timeSlot: '11:00 AM',
      symptoms: 'Mild chest discomfort'
    }, {
      headers: { Authorization: `Bearer ${patientToken}` }
    });
    appointmentId = bookRes.data._id;
    console.log('✅ Appointment booked successfully. ID:', appointmentId);

    // 6. Test Doctor Access Lock - Awaiting Confirmation
    console.log('\n⏳ 6. Testing Doctor Patient Access - Awaiting Admin Confirmation...');
    try {
      await axios.get(`${API_URL}/doctor-portal/patient/${patientUid}`, {
        headers: { Authorization: `Bearer ${doctorToken}` }
      });
      throw new Error('Access was allowed, but appointment is pending confirmation!');
    } catch (err) {
      if (err.response?.status === 403 && err.response.data.reason === 'awaiting_confirmation') {
        console.log('✅ Access correctly BLOCKED with status 403 and reason: awaiting_confirmation.');
      } else {
        throw new Error(`Expected 403 awaiting_confirmation, got status: ${err.response?.status}, reason: ${err.response?.data?.reason}`);
      }
    }

    // 7. Admin Confirming Appointment
    console.log('\n⏳ 7. Admin Confirming the Appointment...');
    const confirmRes = await axios.put(`${API_URL}/appointments/${appointmentId}/status`, {
      status: 'confirmed'
    }, {
      headers: { Authorization: `Bearer ${hospitalToken}` }
    });
    console.log('✅ Appointment confirmed successfully. Status:', confirmRes.data.status);

    // 8. Test Doctor Access Lock - Time restriction (Appointment is tomorrow, access opens 10m before slot)
    console.log('\n⏳ 8. Testing Doctor Patient Access - Time Restriction (Appointment is tomorrow)...');
    try {
      await axios.get(`${API_URL}/doctor-portal/patient/${patientUid}`, {
        headers: { Authorization: `Bearer ${doctorToken}` }
      });
      throw new Error('Access was allowed, but appointment is scheduled for tomorrow!');
    } catch (err) {
      if (err.response?.status === 403 && err.response.data.reason === 'time_restriction') {
        console.log('✅ Access correctly BLOCKED with status 403 and reason: time_restriction.');
        console.log('ℹ️ Scheduled opening time received:', err.response.data.opensAt);
      } else {
        throw new Error(`Expected 403 time_restriction, got status: ${err.response?.status}, reason: ${err.response?.data?.reason}`);
      }
    }

    // 9. Update Appointment to current time slot
    console.log('\n⏳ 9. Updating Appointment Date/Time to current time slot to bypass lock...');
    const Appointment = require('../models/Appointment');
    const now = new Date();
    
    // Format current hour:minute in AM/PM format
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 hour is 12
    const currentTimeSlot = `${hours}:${minutes} ${ampm}`;

    await Appointment.findByIdAndUpdate(appointmentId, {
      appointmentDate: now,
      timeSlot: currentTimeSlot
    });
    console.log(`✅ Database updated. Appointment set to Date: ${now.toDateString()}, timeSlot: ${currentTimeSlot}`);

    // 10. Test Doctor Access - Decrypted Access Allowed
    console.log('\n⏳ 10. Re-testing Doctor Patient Access within Time Window...');
    const accessRes = await axios.get(`${API_URL}/doctor-portal/patient/${patientUid}`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });
    if (accessRes.status === 200 && accessRes.data.uid === patientUid) {
      console.log('✅ Patient profile successfully accessed & decrypted! Patient Name:', `${accessRes.data.firstName} ${accessRes.data.lastName}`);
    } else {
      throw new Error(`Expected 200 OK, got: ${accessRes.status}`);
    }

    // 11. Hospital Admin Uploads Scan Report (base64 MRI scan mockup)
    console.log('\n⏳ 11. Hospital Admin Uploads Scan Report...');
    const uploadRes = await axios.post(`${API_URL}/reports/upload`, {
      patientUid: patientUid,
      report: {
        type: 'scan',
        title: 'Brain Contrast MRI',
        fileName: 'mri_brain_contrast.png',
        fileSize: 452000,
        notes: 'Mild vascular details observed. Brain tissues are normal.',
        fileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' // Single pixel red png
      }
    }, {
      headers: { Authorization: `Bearer ${hospitalToken}` }
    });

    console.log('✅ Report uploaded successfully! Document ID:', uploadRes.data.document._id);
    console.log('ℹ️ Automatically resolved Hospital Name:', uploadRes.data.document.hospitalName);

    // 12. Doctor fetches Patient profile and checks for the uploaded report
    console.log('\n⏳ 12. Doctor fetches updated Patient profile to check uploaded report...');
    const doctorProfileRes = await axios.get(`${API_URL}/doctor-portal/patient/${patientUid}`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });
    const foundDoc = doctorProfileRes.data.documents.find(d => d._id === uploadRes.data.document._id);
    if (foundDoc && foundDoc.title === 'Brain Contrast MRI') {
      console.log('✅ Doctor can view the uploaded MRI report successfully!');
      console.log('ℹ️ Scan Base64 File Content exists:', foundDoc.fileUrl.substring(0, 30) + '...');
    } else {
      throw new Error('Doctor could not locate the uploaded scan document!');
    }

    console.log('\n🎉 ALL HMIS AND CLINICAL INTEGRATION VERIFICATIONS PASSED SUCCESSFULLY! 🎉');
  } catch (error) {
    console.error('\n❌ Verification Failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  }
}

runVerification();
