// An in-memory stand-in for the database, for the exam flow only. Used by the end-to-end exam test and by the dev sandbox
// (scripts/exam-sandbox.js), so the real routes and controllers can run with no network and no real data.
//
// Installing it replaces functions on the repository modules; controllers call them as `repo.fn(...)`, so the replacement is seen.
const examRepo = require('../../src/repositories/examRepository');
const userRepo = require('../../src/repositories/userRepository');
const nudgeRepo = require('../../src/repositories/nudgeRepository');
const proctorEventRepo = require('../../src/repositories/proctorEventRepository');
const auditLogRepo = require('../../src/repositories/auditLogRepository');
const problemRepo = require('../../src/repositories/problemRepository');
const integrityRepo = require('../../src/repositories/integrityRepository');
const mailService = require('../../src/services/mailService');
const { applyEvidence } = require('../../src/utils/examIntegrity');

const EXAM_ID = '11111111-1111-4111-8111-111111111111';
const SEC_MCQ = 'secMcq';
const SEC_CODE = 'secCode';
const PROBLEM = '22222222-2222-4222-8222-222222222222';

// Options: violationLimit; questionCount; studentCount (extra students ld0001..ldNNNN, for load tests); durationMinutes (time once started);
// latencyMs (a pause before every database call, with jitter, standing in for Firestore round trips; 0 = instant).
function createExamFakeDb({ violationLimit = 1, questionCount = 2, studentCount = 0, durationMinutes = 60, latencyMs = 0 } = {}) {
  const now0 = Date.now();
  // integrity: evidence records by `${examId}_${userId}`; mails: every mail the app tried to send; mailMode: 'ok' | 'not_configured' | 'fail' | 'throw'
const db = { attempts: new Map(), nudges: [], events: [], integrity: new Map(), mails: [], mailMode: 'ok', integrityWrites: 0 };
  const exam = { id: EXAM_ID, title: 'Mock Test', isPublished: true, facultyId: 'owner1', durationMinutes, windowStart: new Date(now0 - 3600000), windowEnd: new Date(now0 + Math.max(7200000, (durationMinutes + 60) * 60000)), violationLimit, classroomIds: [], groupIds: [], generalInstructions: 'Read each question carefully. Do not switch tabs.' };
  const sections = [
    { id: SEC_MCQ, type: 'mcq', order: 0, title: 'Aptitude', marksPerQuestion: 1, negativeMarking: 0 },
    { id: SEC_CODE, type: 'coding', order: 1, title: 'Coding', marksPerQuestion: 10, problemIds: [PROBLEM] },
  ];
  const questions = Array.from({ length: questionCount }, (_, i) => ({
    id: `q${i + 1}`, questionText: `Question ${i + 1}: which option is correct?`, options: ['Option A', 'Option B', 'Option C', 'Option D'], correctIndex: (i + 1) % 4, marks: 1, position: i,
  }));
  const users = new Map([
    ['owner1', { id: 'owner1', name: 'Owner Faculty', role: 'faculty', department: 'CSE', email: 'owner1@college.test' }],
    ['other1', { id: 'other1', name: 'Other Faculty', role: 'faculty', department: 'CSE', email: 'other1@college.test' }],
    ['hodCSE', { id: 'hodCSE', name: 'HOD CSE', role: 'hod', department: 'CSE', email: 'hodcse@college.test' }],
    ['hodECE', { id: 'hodECE', name: 'HOD ECE', role: 'hod', department: 'ECE', email: 'hodece@college.test' }],
    ['adm1', { id: 'adm1', name: 'Admin', role: 'admin', email: 'admin@college.test' }],
  ]);
  const addStudent = (id, extra = {}) => users.set(id, { id, name: `Student ${id}`, role: 'student', rollNo: `R-${id}`, section: 'A', email: `${id}@student.test`, ...extra });
  for (const id of ['stu1', 'stu2', 'stu3', 'stuLate', 'stuDone', 'stuLock', 'stuSess']) addStudent(id);
  const loadStudentIds = Array.from({ length: studentCount }, (_, i) => `ld${String(i + 1).padStart(4, '0')}`);
  for (const id of loadStudentIds) addStudent(id);

  // A dotted update path ("questionState.q1") written into a nested object. Keys that reach the prototype are refused at every step.
  const unsafeKey = (k) => k === '__proto__' || k === 'constructor' || k === 'prototype';
  const setPath = (obj, path, value) => {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const k = parts[i];
      if (unsafeKey(k)) throw new Error('refusing to write through "' + path + '"');
      if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
      cur = cur[k];
    }
    const last = parts[parts.length - 1];
    if (unsafeKey(last)) throw new Error('refusing to write through "' + path + '"');
    cur[last] = value;
  };
  const applyUpdate = (doc, update) => { for (const [k, v] of Object.entries(update)) { if (k.includes('.')) setPath(doc, k, structuredClone(v)); else doc[k] = structuredClone(v); } };
  const view = (userId) => { const d = db.attempts.get(userId); return d ? { userId, ...structuredClone(d) } : null; };

  function install() {
    Object.assign(examRepo, {
      getById: async (id) => (id === EXAM_ID ? { ...exam } : null),
      listPublished: async () => [{ ...exam }],
      getSections: async () => sections.map((s) => ({ ...s })),
      getSection: async (_e, sid) => { const s = sections.find((x) => x.id === sid); return s ? { ...s } : null; },
      getSectionQuestions: async () => questions.map((q) => ({ ...q })),
      getSectionCount: async () => sections.length,
      getSectionQuestionCount: async () => questions.length,
      getAttempt: async (_e, uid) => view(uid),
      startAttempt: async (_e, uid, windowExpiresAt) => {
        if (!db.attempts.has(uid)) db.attempts.set(uid, { startedAt: new Date(), windowExpiresAt, submittedAt: null, score: null, total: null, questionState: {}, codingState: {} });
        return view(uid);
      },
      mutateAttempt: async (_e, uid, decide) => {
        const r = decide(view(uid)) || {};
        if (r.update && db.attempts.has(uid)) applyUpdate(db.attempts.get(uid), r.update);
        return r.outcome;
      },
      listAttempts: async () => [...db.attempts.keys()].map(view),
      finishAttempt: async (_e, uid, f) => { applyUpdate(db.attempts.get(uid), { submittedAt: f.submittedAt ?? new Date(), score: f.score, total: f.total, ...(f.autoSubmitted ? { autoSubmitted: true } : {}) }); },
    });
    Object.assign(userRepo, {
      getById: async (id) => users.get(id) || null, getAllUsersMap: async () => new Map(users),
      // Like the real one: 'admin' gives the whole staff collection (faculty, HODs and admins together), so callers must filter by role.
      listByRole: async (role) => [...users.values()].filter((u) => (role === 'student' ? u.role === 'student' : u.role !== 'student')),
    });
    Object.assign(integrityRepo, {
      record: async (examId, userId, { type, detail, now = Date.now() }) => {
        const key = `${examId}_${userId}`;
        const out = applyEvidence(db.integrity.get(key) || null, { examId, userId, type, detail, now });
        db.integrity.set(key, out.record);
        db.integrityWrites += 1;
        return out;
      },
      get: async (examId, userId) => { const r = db.integrity.get(`${examId}_${userId}`); return r ? structuredClone(r) : null; },
      listForExam: async (examId) => [...db.integrity.values()].filter((r) => r.examId === examId).map((r) => structuredClone(r)),
      setMailStatus: async (examId, userId, type, status) => { const r = db.integrity.get(`${examId}_${userId}`); if (r) r.mail = { ...(r.mail || {}), [type]: status }; },
    });
    Object.assign(mailService, {
      isConfigured: () => db.mailMode !== 'not_configured',
      send: async ({ to, subject, text }) => {
        if (db.mailMode === 'not_configured') return { status: 'not_configured' };
        if (db.mailMode === 'throw') throw new Error('smtp exploded');
        db.mails.push({ to, subject, text, ok: db.mailMode === 'ok' });
        return db.mailMode === 'ok' ? { status: 'sent' } : { status: 'failed', error: 'ETIMEDOUT' };
      },
    });
    nudgeRepo.addMany = async (rows) => { db.nudges.push(...rows); };
    proctorEventRepo.create = async (e) => { db.events.push(e); };
    auditLogRepo.create = async () => {};
    problemRepo.getMapByIds = async (ids) => new Map((ids || []).map((id) => [id, { title: 'Two Sum', difficulty: 'easy' }]));
    if (latencyMs > 0) {
      // The wait comes BEFORE each call, so a call still reads and writes in one step (this does not model write contention).
      const slow = (fn) => async (...a) => { await new Promise((r) => setTimeout(r, latencyMs * (0.5 + Math.random()))); return fn(...a); };
      for (const repo of [examRepo, userRepo]) for (const k of Object.keys(repo)) if (typeof repo[k] === 'function') repo[k] = slow(repo[k]);
      for (const [repo, k] of [[nudgeRepo, 'addMany'], [proctorEventRepo, 'create'], [problemRepo, 'getMapByIds']]) repo[k] = slow(repo[k]);
    }
  }

  return { db, exam, sections, questions, users, addStudent, install, loadStudentIds, ids: { EXAM_ID, SEC_MCQ, SEC_CODE, PROBLEM } };
}

module.exports = { createExamFakeDb, EXAM_ID, SEC_MCQ, SEC_CODE, PROBLEM };
