/**
 * Database Configuration and Setup
 * Uses Firebase Admin SDK for Realtime Database
 */

const admin = require('firebase-admin');

let db = null;

/**
 * Initialize the Firebase connection
 */
async function initialize() {
  try {
    const serviceAccount = require('./firebase-service-account.json');
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`
      });
    }
    
    db = admin.database();
    console.log('🔥 Firebase Realtime Database initialized successfully');
    return db;
  } catch (error) {
    console.error('🔥 Firebase initialization error:', error);
    throw error;
  }
}

/**
 * Get the Firebase Realtime Database instance
 */
function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initialize() first.');
  }
  return db;
}

module.exports = {
  initialize,
  getDb,
  admin
};
