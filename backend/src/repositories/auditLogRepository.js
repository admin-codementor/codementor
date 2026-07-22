// Audit logs — Firestore only. Nothing else references audit_logs(id), so
// no Postgres FK-stub is needed.
const { db } = require('../config/firestore');
const { FieldValue } = require('firebase-admin/firestore');

const col = () => db.collection('auditLogs');

async function create({ userId, action, detail, ip }) {
  await col().add({ userId, action, detail: detail || null, ip: ip || null, createdAt: FieldValue.serverTimestamp() });
}

async function listRecent(limit = 100) {
  const snap = await col().orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

module.exports = { create, listRecent };
