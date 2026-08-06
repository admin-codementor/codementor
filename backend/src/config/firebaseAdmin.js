try {
  require('dotenv').config();
} catch (e) {}
const { initializeApp, getApps, getApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const fs = require('fs');
const path = require('path');

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const envConfig = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
  const jsonStr = envConfig.startsWith('{')
    ? envConfig
    : Buffer.from(envConfig, 'base64').toString('utf8');
  serviceAccount = JSON.parse(jsonStr);
} else {
  const localPath = path.join(__dirname, '../../service-account.json');
  if (fs.existsSync(localPath)) {
    serviceAccount = require(localPath);
  } else {
    throw new Error('Firebase service account missing from FIREBASE_SERVICE_ACCOUNT env var and service-account.json.');
  }
}

const firebaseApp = getApps().length ? getApp() : initializeApp({ credential: cert(serviceAccount) });

module.exports = { firebaseApp, firebaseAuth: getAuth(firebaseApp) };

