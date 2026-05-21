const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

dotenv.config();

async function checkUser() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const user = await User.findOne({ email: 'hospital2@fortis.com' });
    if (user) {
      console.log('👤 User found:', {
        email: user.email,
        role: user.role,
        passwordHash: user.password.substring(0, 10) + '...'
      });
    } else {
      console.log('❌ User not found');
    }

    await mongoose.connection.close();
  } catch (err) {
    console.error('❌ Error:', err);
  }
}

checkUser();
