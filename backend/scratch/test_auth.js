const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

async function runTests() {
  const patientEmail = `patient.${Date.now()}@test.com`;
  const patientPassword = 'TestPassword123!';
  const hospitalEmail = `hospital.${Date.now()}@test.com`;
  const hospitalPassword = 'HospitalPassword123!';

  console.log('🧪 Starting Authentication Flow Tests...\n');

  // Test 1: Patient Registration
  try {
    console.log('⏳ Test 1: Registering Patient...');
    const registerPatientRes = await axios.post(`${API_URL}/auth/register`, {
      role: 'patient',
      firstName: 'John',
      lastName: 'Doe',
      email: patientEmail,
      password: patientPassword
    });
    console.log('✅ Patient registered successfully! User ID:', registerPatientRes.data.user.id);
  } catch (err) {
    console.error('❌ Patient registration failed:', err.response?.data || err.message);
    process.exit(1);
  }

  // Test 2: Patient Login
  try {
    console.log('\n⏳ Test 2: Logging in Patient...');
    const loginPatientRes = await axios.post(`${API_URL}/auth/login`, {
      email: patientEmail,
      password: patientPassword
    });
    console.log('✅ Patient login successful! Token length:', loginPatientRes.data.token.length);
  } catch (err) {
    console.error('❌ Patient login failed:', err.response?.data || err.message);
    process.exit(1);
  }

  // Test 3: Hospital Admin Registration
  try {
    console.log('\n⏳ Test 3: Registering Hospital Admin...');
    const registerHospitalRes = await axios.post(`${API_URL}/auth/register`, {
      role: 'hospital_admin',
      hospitalName: 'General Hospital',
      email: hospitalEmail,
      password: hospitalPassword
    });
    console.log('✅ Hospital Admin registered successfully! User ID:', registerHospitalRes.data.user.id);
  } catch (err) {
    console.error('❌ Hospital Admin registration failed:', err.response?.data || err.message);
    process.exit(1);
  }

  // Test 4: Hospital Admin Login
  try {
    console.log('\n⏳ Test 4: Logging in Hospital Admin...');
    const loginHospitalRes = await axios.post(`${API_URL}/auth/login`, {
      email: hospitalEmail,
      password: hospitalPassword
    });
    console.log('✅ Hospital Admin login successful! Token length:', loginHospitalRes.data.token.length);
  } catch (err) {
    console.error('❌ Hospital Admin login failed:', err.response?.data || err.message);
    process.exit(1);
  }

  // Test 5: Forgot Password & Reset Password Flow
  try {
    console.log('\n⏳ Test 5: Testing Forgot Password for Patient...');
    // We will call the forgot password route
    const forgotRes = await axios.post(`${API_URL}/auth/forgot-password`, {
      email: patientEmail
    });
    console.log('✅ Forgot password OTP request successful! Message:', forgotRes.data.message);

    // Let's connect to Mongo to retrieve the OTP from DB directly
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mediid');
    const User = require('../models/User');
    const user = await User.findOne({ email: patientEmail });
    if (!user || !user.resetPasswordToken) {
      throw new Error('Reset token not found in DB!');
    }
    const otp = user.resetPasswordToken;
    console.log(`ℹ️ Retrieved OTP from DB: ${otp}`);
    await mongoose.disconnect();

    console.log('⏳ Resetting password with OTP...');
    const newPassword = 'NewPassword987!';
    const resetRes = await axios.post(`${API_URL}/auth/reset-password`, {
      email: patientEmail,
      otp,
      newPassword
    });
    console.log('✅ Password reset successful! Message:', resetRes.data.message);

    console.log('⏳ Logging in with NEW password...');
    const loginNewRes = await axios.post(`${API_URL}/auth/login`, {
      email: patientEmail,
      password: newPassword
    });
    console.log('✅ Login with new password successful! Token length:', loginNewRes.data.token.length);

    console.log('⏳ Verifying old password no longer works...');
    try {
      await axios.post(`${API_URL}/auth/login`, {
        email: patientEmail,
        password: patientPassword
      });
      console.error('❌ Error: Old password still works!');
      process.exit(1);
    } catch (loginOldErr) {
      console.log('✅ Old password correctly rejected! Status:', loginOldErr.response?.status);
    }

  } catch (err) {
    console.error('❌ Forgot/Reset password flow failed:', err.response?.data || err.message);
    process.exit(1);
  }

  console.log('\n🎉 ALL AUTHENTICATION FLOW TESTS PASSED SUCCESSFULLY! 🎉');
}

runTests();
