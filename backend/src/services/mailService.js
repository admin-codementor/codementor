// Outgoing mail over SMTP, configured in .env. Works with any provider (Gmail with an app password, Brevo, the college's mail server).
//
//   SMTP_HOST, SMTP_PORT (default 587), SMTP_SECURE (true for port 465), SMTP_USER, SMTP_PASS, MAIL_FROM ("CodeMentor <no-reply@college.edu>")
//
// Sending mail must NEVER get in the way of an exam: nothing here throws, and callers do not wait on it. If SMTP is not configured the
// message is simply not sent, and the caller is told so ('not_configured') so the report can say it.
const nodemailer = require('nodemailer');

let transport = null;

const isConfigured = () => !!(process.env.SMTP_HOST && process.env.MAIL_FROM);

function getTransport() {
  if (transport) return transport;
  const port = Number(process.env.SMTP_PORT) || 587;
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true' || port === 465,
    ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } } : {}),
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
  return transport;
}

/** @returns {Promise<{status: 'sent'|'failed'|'not_configured', error?: string}>} never rejects */
async function send({ to, subject, text }) {
  if (!isConfigured()) return { status: 'not_configured' };
  const recipients = (Array.isArray(to) ? to : [to]).map((a) => String(a || '').trim()).filter((a) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(a));
  if (recipients.length === 0) return { status: 'failed', error: 'no valid recipient address' };
  try {
    await getTransport().sendMail({
      from: process.env.MAIL_FROM,
      // One message per person: an admin never sees a student's address and the other way round.
      to: recipients.length === 1 ? recipients[0] : undefined,
      bcc: recipients.length > 1 ? recipients : undefined,
      subject: String(subject).replace(/[\r\n]+/g, ' ').slice(0, 200),
      text: String(text),
    });
    return { status: 'sent' };
  } catch (e) {
    return { status: 'failed', error: String(e?.code || e?.message || 'send failed').slice(0, 120) };
  }
}

/** For tests: forget the transport so changed settings are read again. */
const reset = () => { transport = null; };

module.exports = { send, isConfigured, reset };
