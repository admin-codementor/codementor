// DEV ONLY. Runs the real API with an in-memory database holding one demo exam, so the exam screens can be tried in a browser with no
// real data, no real credentials and no network. Nothing here touches Firestore, Redis or any real service (tests/hermeticEnv.js blocks them).
//
//   node scripts/exam-sandbox.js                 # API on http://localhost:3003
//   PORT=3004 SANDBOX_LIMIT=2 node scripts/exam-sandbox.js
//
// Then run the website against it:  API_PROXY_TARGET=http://localhost:3003 npx next dev --webpack -p 3300  (in frontend-next)
// It writes browser snippets that sign you in as a student, the exam's owner or an Admin (signed with a throwaway key that only this
// process knows). Paste one into the browser console on the website.
if (process.env.NODE_ENV === 'production') {
  console.error('exam-sandbox is a development tool and refuses to run with NODE_ENV=production.');
  process.exit(1);
}
require('../tests/hermeticEnv');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { createExamFakeDb, EXAM_ID } = require('../tests/fakes/examFakeDb');

const PORT = Number(process.env.PORT) || 3003;
const fake = createExamFakeDb({ violationLimit: Number(process.env.SANDBOX_LIMIT ?? 3), questionCount: Number(process.env.SANDBOX_QUESTIONS ?? 12) });
fake.install();

const app = require('../src/app');

const snippet = (id, target) => {
  const u = fake.users.get(id);
  const claims = { id, role: u.role, permissions: {}, department: u.department ?? null, tv: 0 };
  const access = jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: '12h' });
  const refresh = jwt.sign(claims, process.env.JWT_REFRESH_SECRET, { expiresIn: '12h' });
  const user = { id, name: u.name, email: `${id}@sandbox.test`, role: u.role, department: u.department ?? null };
  return `localStorage.setItem("accessToken",${JSON.stringify(access)});localStorage.setItem("refreshToken",${JSON.stringify(refresh)});localStorage.setItem("user",${JSON.stringify(JSON.stringify(user))});try{sessionStorage.clear()}catch(e){};location.href=${JSON.stringify(target)};`;
};

const out = process.env.SANDBOX_OUT;
if (out) {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'sandbox-student1.js'), snippet('stu1', `/app/exams/${EXAM_ID}`));
  fs.writeFileSync(path.join(out, 'sandbox-student2.js'), snippet('stu2', `/app/exams/${EXAM_ID}`));
  fs.writeFileSync(path.join(out, 'sandbox-owner.js'), snippet('owner1', `/faculty/exams/${EXAM_ID}/roster`));
  fs.writeFileSync(path.join(out, 'sandbox-admin.js'), snippet('adm1', `/faculty/exams/${EXAM_ID}/roster`));
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`exam sandbox on http://127.0.0.1:${PORT}  (exam ${EXAM_ID}, pause after ${process.env.SANDBOX_LIMIT ?? 3} violations)`);
  if (out) console.log(`sign-in snippets written to ${out}`);
});
