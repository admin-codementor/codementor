// The real mail library against a tiny local SMTP server (no network, no account): what is actually put on the wire.
require('../hermeticEnv');
const net = require('net');

const CRLF = String.fromCharCode(13, 10);

/** A minimal SMTP server: accepts one or more messages and keeps what it was sent. */
function smtpServer() {
  const received = [];
  const server = net.createServer((sock) => {
    let buf = ''; let inData = false; let cur = { from: null, rcpt: [], data: '' };
    const say = (line) => sock.write(line + CRLF);
    say('220 test ESMTP');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf(CRLF)) !== -1) {
        const line = buf.slice(0, idx); buf = buf.slice(idx + 2);
        if (inData) {
          if (line === '.') { inData = false; received.push(cur); cur = { from: null, rcpt: [], data: '' }; say('250 queued'); } else cur.data += line + CRLF;
          continue;
        }
        const up = line.toUpperCase();
        if (up.startsWith('EHLO') || up.startsWith('HELO')) say('250 test');
        else if (up.startsWith('MAIL FROM')) { cur.from = line.slice(10); say('250 ok'); }
        else if (up.startsWith('RCPT TO')) { cur.rcpt.push(line.slice(8)); say('250 ok'); }
        else if (up === 'DATA') { inData = true; say('354 go'); }
        else if (up === 'QUIT') { say('221 bye'); sock.end(); }
        else say('250 ok');
      }
    });
    sock.on('error', () => {});
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, received, port: server.address().port })));
}

module.exports = async function (s) {
  delete require.cache[require.resolve('../../src/services/mailService')];
  const mail = require('../../src/services/mailService');
  const set = (env) => { for (const k of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM']) delete process.env[k]; Object.assign(process.env, env); mail.reset(); };

  set({});
  s.check('without SMTP settings nothing is sent and the caller is told', !mail.isConfigured() && (await mail.send({ to: 'a@b.example', subject: 's', text: 't' })).status === 'not_configured');

  const smtp = await smtpServer();
  try {
    set({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.port), MAIL_FROM: 'CodeMentor <no-reply@college.example>' });
    s.check('settings are recognised', mail.isConfigured());

    const r = await mail.send({ to: 'student@college.example', subject: 'Exam integrity notice: Mid Test', text: 'Line one' + CRLF + 'Line two' });
    s.check('a message is delivered to the server', r.status === 'sent' && smtp.received.length === 1);
    const m = smtp.received[0];
    s.check('it has the right sender, recipient, subject and body', /no-reply@college\.example/.test(m.from) && m.rcpt.length === 1 && /student@college\.example/.test(m.rcpt[0]) && /Subject: Exam integrity notice: Mid Test/.test(m.data) && /Line one/.test(m.data) && /Line two/.test(m.data));
    s.check('a single recipient is a real "To", so one person never sees another\'s address', /To: student@college\.example/.test(m.data));

    const inj = await mail.send({ to: 'a@college.example', subject: 'Hello' + CRLF + 'Bcc: attacker@evil.example', text: 'x' });
    const im = smtp.received[smtp.received.length - 1];
    s.check('a line break in the subject cannot add a mail header', inj.status === 'sent' && !/^Bcc: attacker/m.test(im.data) && !im.rcpt.some((x) => /attacker/.test(x)));

    const many = await mail.send({ to: ['admin1@college.example', 'admin2@college.example'], subject: 'Two admins', text: 'x' });
    const mm = smtp.received[smtp.received.length - 1];
    s.check('several recipients get one message each as hidden copies, not a visible list', many.status === 'sent' && mm.rcpt.length === 2 && !/^To: .*admin1@/m.test(mm.data));

    const none = await mail.send({ to: ['not-an-address', '', null, 'also bad@'], subject: 's', text: 't' });
    s.check('addresses that are not addresses are dropped, and with none left nothing is sent', none.status === 'failed' && /recipient/.test(none.error) && smtp.received.length === 3);
    const mixed = await mail.send({ to: ['good@college.example', 'nope'], subject: 's', text: 't' });
    s.check('a bad address next to a good one does not stop the good one', mixed.status === 'sent' && /good@college\.example/.test(smtp.received[smtp.received.length - 1].rcpt[0]));
  } finally {
    await new Promise((resolve) => smtp.server.close(resolve));
  }

  // a server that is down: reported as failed, quickly, never thrown
  set({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.port), MAIL_FROM: 'x@college.example' });
  const t0 = Date.now();
  const down = await mail.send({ to: 'a@college.example', subject: 's', text: 't' });
  s.check('an unreachable mail server is a "failed" result with a short reason, not an exception', down.status === 'failed' && !!down.error && down.error.length <= 120 && Date.now() - t0 < 12000);

  set({});
};
