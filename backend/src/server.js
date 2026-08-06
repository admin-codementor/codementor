// Local-dev entry point. `npm run dev`/`npm start` run this; Vercel uses
// api/index.js instead (same app.js, wrapped with serverless-http). Kept
// separate so nothing here — a listening port, Judge0's startup health
// check — runs inside a serverless invocation.
const app = require('./app');
const { checkJudge0Health } = require('./config/judge0Health');

const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  await checkJudge0Health();
});
