const { initializeApp, getApps, getApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../../firebase-service-account.json'));

const firebaseApp = getApps().length ? getApp() : initializeApp({ credential: cert(serviceAccount) });

module.exports = { firebaseAuth: getAuth(firebaseApp) };
