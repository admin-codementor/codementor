const { getFirestore } = require('firebase-admin/firestore');
const { firebaseApp } = require('./firebaseAdmin');

const db = getFirestore(firebaseApp);

module.exports = { db };
