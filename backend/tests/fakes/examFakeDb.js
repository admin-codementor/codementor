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

const EXAM_ID = '11111111-1111-4111-8111-111111111111';
const SEC_MCQ = 'secMcq';
const SEC_CODE = 'secCode';
const PROBLEM = '22222222-2222-4222-8222-222222222222';

// Options: violationLimit; questionCount; studentCount (extra students ld0001..ldNNNN, for load tests); durationMinutes (time once started);
// latencyMs (a pause before every database call, with jitter, standing in for Firestore round trips; 0 = instant).
function createExamFakeDb({ violationLimit = 1, questionCount = 2, studentCount = 0, durationMinutes = 60, latencyMs = 0 } = {}) {
  const now0 = Date.now();
  const db = { attempts: new Map(), nudges: [], events: [] };
  const exam = { id: EXAM_ID, title: 'Mock Test', isPublished: true, facultyId: 'owner1', durationMinutes, windowStart: new Date(now0 - 3600000), windowEnd: new Date(now0 + Math.max(7200000, (durationMinutes + 60) * 60000)), violationLimit, classroomIds: [], groupIds: [], generalInstructions: 'Read each question carefully. Do not switch tabs.' };
  const sections = [
    { id: SEC_MCQ, type: 'mcq', order: 0, title: 'Aptitude', marksPerQuestion: 1, negativeMarking: 0 },
    { id: SEC_CODE, type: 'coding', order: 1, title: 'Coding', marksPerQuestion: 10, problemIds: [PROBLEM] },
  ];
  const questions = Array.from({ length: questionCount }, (_, i) => ({
    id: `q${i + 1}`, questionText: `Question ${i + 1}: which option is correct?`, options: ['Option A', 'Option B', 'Option C', 'Option D'], correctIndex: (i + 1) % 4, marks: 1, position: i,
  }));
  const users = new Map([
    ['owner1', { id: 'owner1', name: 'Owner Faculty', role: 'faculty', department: 'CSE' }],
    ['other1', { id: 'other1', name: 'Other Faculty', role: 'faculty', department: 'CSE' }],
    ['hodCSE', { id: 'hodCSE', name: 'HOD CSE', role: 'hod', department: 'CSE' }],
    ['hodECE', { id: 'hodECE', name: 'HOD ECE', role: 'hod', department: 'ECE' }],
    ['adm1', { id: 'adm1', name: 'Admin', role: 'admin' }],
  ]);
  const addStudent = (id, extra = {}) => users.set(id, { id, name: `Student ${id}`, role: 'student', rollNo: `R-${id}`, section: 'A', ...extra });
  for (const id of ['stu1', 'stu2', 'stu3', 'stuLate', 'stuDone', 'stuLock', 'stuSess']) addStudent(id);
  const loadStudentIds = Array.from({ length: studentCount }, (_, i) => `ld${String(i + 1).padStart(4, '0')}`);
  for (const id of loadStudentIds) addStudent(id);

  const setPath = (obj, path, value) => {
    const parts = path.split('.');
    if (parts.some((p) => p === '__proto__' || p === 'constructor' || p === 'prototype')) throw new Error(`refusing to write through "${path}"`);
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i += 1) { if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {}; cur = cur[parts[i]]; }
    cur[parts[parts.length - 1]] = value;
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
    Object.assign(userRepo, { getById: async (id) => users.get(id) || null, getAllUsersMap: async () => new Map(users) });
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
