const mongoose = require('mongoose');
const dns = require('dns');

// 🔧 Fix for querySrv ECONNREFUSED on some networks (like Jio)
try {
    dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {
    console.warn('⚠️ Manual DNS override failed, relying on system defaults.');
}

// Global reference for secondary connection
let marketplaceConn = null;

const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) {
        return mongoose.connection;
    }

    try {
        console.log('🔄 Connecting to Primary MongoDB...');
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000, 
            socketTimeoutMS: 45000,
            family: 4,
        });
        console.log(`✅ Primary MongoDB Connected: ${conn.connection.host}`);
        return conn.connection;
    } catch (error) {
        console.error(`❌ Primary MongoDB Connection Error: ${error.message}`);
        throw error;
    }
};

const getMarketplaceConn = () => {
    // Simply reuse the existing Primary connection so everything stays in `mediid_marketplace_db`
    if (mongoose.connection.readyState >= 1) {
        return mongoose.connection;
    }
    console.warn('⚠️ getMarketplaceConn called before Primary DB connected.');
    return mongoose.connection;
};

module.exports = { connectDB, getMarketplaceConn };


