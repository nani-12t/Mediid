const mongoose = require('mongoose');
const dns = require('dns');

const uri = process.env.MONGO_URI || '';
// 🔧 Fix for querySrv ECONNREFUSED on some networks (like Jio) for MongoDB Atlas (SRV) connections
if (uri.startsWith('mongodb+srv://')) {
    try {
        dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
    } catch (e) {
        console.warn('⚠️ Manual DNS override failed, relying on system defaults.');
    }
}

// Global reference for secondary connection
let marketplaceConn = null;

const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) {
        return mongoose.connection;
    }

    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 10000, 
            socketTimeoutMS: 45000,
            family: 4,
        });
        console.log(`✅ Primary MongoDB Connected: ${conn.connection.host}`);
        return conn.connection;
    } catch (error) {
        console.error(`❌ Primary MongoDB Connection Error: ${error.message}`);
        console.error(`💡 Tip: If running locally, ensure the MongoDB Windows service is active (run: net start MongoDB).`);
        throw error;
    }
};

const getMarketplaceConn = () => {
    if (marketplaceConn) return marketplaceConn;
    
    // Derive marketplace URI by replacing the DB name if not explicitly provided
    const mainUri = process.env.MONGO_URI;
    const marketplaceUri = process.env.MARKETPLACE_URI || mainUri.replace(/\/[^/?]+(\?|$)/, '/mediid_marketplace$1');
    
    marketplaceConn = mongoose.createConnection(marketplaceUri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        family: 4
    });

    marketplaceConn.on('connected', () => console.log('✅ Marketplace DB Connected'));
    marketplaceConn.on('error', (err) => console.error('❌ Marketplace DB Error:', err));

    return marketplaceConn;
};

module.exports = { connectDB, getMarketplaceConn };


