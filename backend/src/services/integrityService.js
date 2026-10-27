// Records exam integrity evidence and mails the student and the admins when it should. Called from the exam endpoints as
// `integrity.report(...)` and NEVER awaited: it cannot slow a save down and it never throws.
const examIntegrity = require('../utils/examIntegrity');
const integrityRepo = require('../repositories/integrityRepository');
const examLive = require('./examLiveService');
const userRepo = require('../repositories/userRepository');
const mailService = require('./mailService');

const lastWritten = new Map();   // `${exam}:${user}:${type}` -> time of the last write; keeps a flood of bad requests to one write per 20 s
const MAX_TRACKED = 5000;

function appLink(examId) {
  const base = (process.env.APP_URL || String(process.env.CORS_ORIGIN || '').split(',')[0] || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(base) ? `${base}/faculty/exams/${examId}/integrity` : null;
}

async function adminAddresses() {
  const staff = await userRepo.listByRole('admin');   // the staff collection holds faculty, HODs and admins together
  return staff.filter((u) => u.role === 'admin' && u.email).map((u) => u.email);
}

/** Send the two mails for one piece of evidence and note what happened. */
async function sendMails({ examId, userId, type, record }) {
  const [exam, student, admins] = await Promise.all([examLive.examDoc(examId), userRepo.getById(userId), adminAddresses()]);
  const text = examIntegrity.buildEmails({ student, exam, type, record, link: appLink(examId) });
  const results = [];
  if (student?.email) results.push(await mailService.send({ to: student.email, subject: text.student.subject, text: text.student.text }));
  for (const a of admins) results.push(await mailService.send({ to: a, subject: text.admin.subject, text: text.admin.text }));
  const failed = results.find((r) => r.status === 'failed');
  const status = results.length === 0 ? 'failed' : results.some((r) => r.status === 'not_configured') ? 'not_configured' : failed ? 'failed' : 'sent';
  await integrityRepo.setMailStatus(examId, userId, type, {
    status, at: Date.now(), recipients: results.length, ...(failed?.error ? { error: failed.error } : {}),
    ...(results.length === 0 ? { error: 'no recipient address on file' } : {}),
  });
  return status;
}

/**
 * @param {{examId: string, userId: string, type: string, detail?: string}} e
 * @returns {Promise<void>} resolves when done; callers should not wait on it
 */
async function report({ examId, userId, type, detail }) {
  try {
    if (!examId || !userId || !examIntegrity.EVIDENCE[type]) return;
    const key = `${examId}:${userId}:${type}`;
    const now = Date.now();
    if (now - (lastWritten.get(key) || 0) < examIntegrity.THROTTLE_MS) return;
    if (lastWritten.size >= MAX_TRACKED) lastWritten.clear();
    lastWritten.set(key, now);
    if (!(await examLive.examDoc(examId))) return;          // an exam that does not exist is not worth a record
    const { record, email } = await integrityRepo.record(examId, userId, { type, detail, now });
    if (email) await sendMails({ examId, userId, type, record });
  } catch (e) {
    console.error('integrity report failed:', String(e?.message || e).slice(0, 160));
  }
}

/** Staff pressed "send again": mails for one kind of evidence that is already on the record. */
async function resend({ examId, userId, type }) {
  const record = await integrityRepo.get(examId, userId);
  if (!record || !record.counts?.[type]) return { status: 'none' };
  return { status: await sendMails({ examId, userId, type, record }) };
}

module.exports = { report, resend, _lastWritten: lastWritten };
