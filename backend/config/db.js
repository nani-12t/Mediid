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

function requireMongoUri(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(name + ' is required. Create backend/.env from backend/.env.example and configure your MongoDB connection.');
    }
    if (!/^mongodb(?:\+srv)?:\/\//.test(value)) {
        throw new Error(name + ' must start with mongodb:// or mongodb+srv://.');
    }
    return value;
}

const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) {
        return mongoose.connection;
    }

    try {
        const conn = await mongoose.connect(requireMongoUri('MONGO_URI'), {
            serverSelectionTimeoutMS: 5000, 
            socketTimeoutMS: 45000,
            family: 4,
        });
        console.log(`✅ Primary MongoDB Connected: ${conn.connection.host}`);
        return conn.connection;
    } catch (error) {
        throw error;
    }
};

const getMarketplaceConn = () => {
    if (marketplaceConn) return marketplaceConn;
    
    // dbName also handles a primary URI with no database path.
    const explicitMarketplace = Boolean(process.env.MARKETPLACE_URI?.trim());
    const marketplaceUri = requireMongoUri(explicitMarketplace ? 'MARKETPLACE_URI' : 'MONGO_URI');
    
    marketplaceConn = mongoose.createConnection(marketplaceUri, {
        ...(explicitMarketplace ? {} : { dbName: 'mediid_marketplace' }),
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        family: 4
    });

    marketplaceConn.on('connected', () => console.log('✅ Marketplace DB Connected'));
    marketplaceConn.on('error', (err) => console.error('❌ Marketplace DB Error:', err));

    return marketplaceConn;
};

module.exports = { connectDB, getMarketplaceConn };


