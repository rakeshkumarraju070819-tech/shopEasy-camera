const mongoose = require('mongoose');

/** Connects to MongoDB. Returns true on success, false if no URI / connection failed. */
async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[db] MONGODB_URI not set – using TEMPORARY in-memory store (data resets on restart).');
    return false;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log('[db] Connected to MongoDB');
    return true;
  } catch (err) {
    console.error('[db] MongoDB connection failed:', err.message);
    if (process.env.NODE_ENV === 'production') throw err;
    console.warn('[db] Falling back to in-memory store (development only).');
    return false;
  }
}

module.exports = connectDB;
