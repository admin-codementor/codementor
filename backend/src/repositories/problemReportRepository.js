// "Report a problem" messages. Single-field queries, sorted in JS, so no composite index.
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/firestore');

const col = () => db.collection('problemReports');
const toDoc = (d) => ({ id: d.id, ...d.data() });

async function create(data) {
  const id = uuidv4();
  await col().doc(id).set({ ...data, status: 'open', atMs: Date.now() });
  return id;
}
async function list(status, limit = 200) {
  const q = status ? col().where('status', '==', status) : col();
  const snap = await q.limit(1000).get();
  return snap.docs.map(toDoc).sort((a, b) => b.atMs - a.atMs).slice(0, limit);
}
async function get(id) { const d = await col().doc(id).get(); return d.exists ? toDoc(d) : null; }
async function setStatus(id, status, byId) { await col().doc(id).set({ status, statusBy: byId, statusAtMs: Date.now() }, { merge: true }); }
async function prune(cutoffMs, max = 300) {
  const snap = await col().where('atMs', '<', cutoffMs).limit(max).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

module.exports = { create, list, get, setStatus, prune };
