try {
  require('dotenv').config({ quiet: true });
} catch { /* dotenv is optional when the host injects env vars directly */ }
const { initializeApp, getApps, getApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const fs = require('fs');
const path = require('path');

// Against the local emulator there is no project to authenticate to, so no
// service-account key is needed — and CI must never hold one. The Firestore
// client picks up FIRESTORE_EMULATOR_HOST by itself; it only needs a project id
// to namespace the data.
function buildApp() {
  if (getApps().length) return getApp();

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'codementor-emulator';
    return initializeApp({ projectId });
  }

  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const envConfig = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
    const jsonStr = envConfig.startsWith('{')
      ? envConfig
      : Buffer.from(envConfig, 'base64').toString('utf8');
    serviceAccount = JSON.parse(jsonStr);
  } else {
    const localPath = path.join(__dirname, '../../service-account.json');
    if (!fs.existsSync(localPath)) {
      throw new Error('Firebase service account missing from FIREBASE_SERVICE_ACCOUNT env var and service-account.json.');
    }
    serviceAccount = require(localPath);
  }

  return initializeApp({ credential: cert(serviceAccount) });
}

const firebaseApp = buildApp();

module.exports = { firebaseApp, firebaseAuth: getAuth(firebaseApp) };
