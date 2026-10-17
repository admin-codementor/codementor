// Is Firestore usable right now? Reads one document and writes then deletes a throwaway one.
// Run this before any script that changes data, to find out whether the free daily quota has reset.
//
//   node scripts/check-firestore.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { db } = require('../src/config/firestore');

(async () => {
  try {
    await db.collection('students').limit(1).get();
    const ping = db.collection('_preflight').doc('check');
    await ping.set({ at: new Date() });
    await ping.delete();
    console.log('Firestore is available (read and write both work). You can run the account scripts now.');
    process.exit(0);
  } catch (e) {
    if (/RESOURCE_EXHAUSTED/.test(e.message)) {
      console.log('Still out of quota. The free daily quota resets at midnight Pacific time (about 1:00 pm IST). Nothing was changed.');
    } else console.log(`Firestore check failed: ${e.message}`);
    process.exit(1);
  }
})();
