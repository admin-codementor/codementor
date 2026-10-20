// College-wide settings for the coding score: the red / green thresholds, one pair per college year plus a default.
// One small document. Nothing else reads it.
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const ref = () => db.collection('settings').doc('platformThresholds');

async function get() {
  const doc = await ref().get();
  const d = doc.exists ? doc.data() : {};
  return { default: d.default || null, byYear: d.byYear || {} };
}

/** @param {string} yearKey 'default' or a year number as text */
async function setThresholds(yearKey, thresholds, updatedBy) {
  const patch = yearKey === 'default' ? { default: thresholds } : { byYear: { [yearKey]: thresholds } };
  await ref().set({ ...patch, updatedBy, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return get();
}

async function clear(yearKey, updatedBy) {
  if (yearKey === 'default') await ref().set({ default: FieldValue.delete(), updatedBy, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  else await ref().set({ byYear: { [yearKey]: FieldValue.delete() }, updatedBy, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return get();
}

module.exports = { get, setThresholds, clear };
