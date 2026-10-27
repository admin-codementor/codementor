// An in-memory stand-in for the placement storage, the student and staff records, reminders and the audit log (no network, no Firestore).
// Installing it replaces functions on the repository modules; services call them as `repo.fn(...)`, so the replacement is seen.
const placementRepo = require('../../src/repositories/placementRepository');
const userRepo = require('../../src/repositories/userRepository');
const nudgeRepo = require('../../src/repositories/nudgeRepository');
const auditLogRepo = require('../../src/repositories/auditLogRepository');
const platformScoreService = require('../../src/services/platformScoreService');

function createPlacementFakeDb() {
  const db = {
    users: new Map(), drives: new Map(), apps: new Map(), records: new Map(), batches: new Map(), outside: new Map(), nudges: [], audit: [], seq: 0,
  };
  const clone = (v) => (v == null ? v : structuredClone(v));
  const addUser = (u) => { db.users.set(u.id, { ...u }); return u; };
  const nextId = (p) => `${p}${(db.seq += 1)}`;

  function install() {
    Object.assign(userRepo, {
      getById: async (id) => clone(db.users.get(id) || null),
      getMapByRole: async (role) => new Map([...db.users.values()].filter((u) => (role === 'student' ? u.role === 'student' : u.role !== 'student')).map((u) => [u.id, clone(u)])),
      listByRole: async (role) => [...db.users.values()].filter((u) => (role === 'student' ? u.role === 'student' : u.role !== 'student')).map(clone),
    });
    Object.assign(placementRepo, {
      createDrive: async (data) => { const d = { id: nextId('drive'), ...clone(data) }; db.drives.set(d.id, d); return clone(d); },
      getDrive: async (id) => clone(db.drives.get(id) || null),
      updateDrive: async (id, partial) => { Object.assign(db.drives.get(id), clone(partial)); return clone(db.drives.get(id)); },
      listDrives: async () => [...db.drives.values()].map(clone),
      removeDrive: async (id) => { for (const [k, a] of db.apps) if (a.driveId === id) db.apps.delete(k); db.drives.delete(id); },
      listApplicationsByDrive: async (driveId) => [...db.apps.values()].filter((a) => a.driveId === driveId).map(clone),
      listApplicationsByStudent: async (studentId) => [...db.apps.values()].filter((a) => a.studentId === studentId).map(clone),
      listAllApplications: async () => [...db.apps.values()].map(clone),
      upsertApplication: async (driveId, studentId, data) => { db.apps.set(`${driveId}_${studentId}`, { driveId, studentId, ...clone(data) }); },
      removeApplication: async (driveId, studentId) => { db.apps.delete(`${driveId}_${studentId}`); },
      listRecords: async () => new Map([...db.records].map(([k, v]) => [k, clone(v)])),
      getRecord: async (studentId) => clone(db.records.get(studentId) || null),
      writeRecords: async (items) => { for (const it of items) { if (it.data == null) db.records.delete(it.studentId); else db.records.set(it.studentId, clone(it.data)); } },
      createBatch: async (id, data) => { db.batches.set(id, { id, ...clone(data) }); return id; },
      listBatches: async () => [...db.batches.values()].map(clone).sort((a, b) => (b.atMs || 0) - (a.atMs || 0)),
      getBatch: async (id) => clone(db.batches.get(id) || null),
      updateBatch: async (id, partial) => { Object.assign(db.batches.get(id), clone(partial)); },
      listOutside: async () => [...db.outside.values()].map(clone),
      listOutsideByStudent: async (studentId) => [...db.outside.values()].filter((o) => o.studentId === studentId).map(clone),
      getOutside: async (id) => clone(db.outside.get(id) || null),
      createOutside: async (data) => { const o = { id: nextId('out'), ...clone(data) }; db.outside.set(o.id, o); return clone(o); },
      updateOutside: async (id, partial) => { Object.assign(db.outside.get(id), clone(partial)); return clone(db.outside.get(id)); },
      removeOutside: async (id) => { db.outside.delete(id); },
    });
    nudgeRepo.addMany = async (rows) => { db.nudges.push(...clone(rows)); };
    auditLogRepo.create = async (row) => { db.audit.push(clone(row)); };
    platformScoreService.collegeScores = async () => ({ rows: [...db.users.values()].filter((u) => u.role === 'student').map((u) => ({ id: u.id, overall: u.codingScore ?? 0 })) });
  }

  return { db, install, addUser };
}

module.exports = { createPlacementFakeDb };
