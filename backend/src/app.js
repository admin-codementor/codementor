// Plain Express app — no HTTP server, no Socket.IO, no background worker.
// This is the one thing both entry points share:
//   - backend/src/server.js wraps this in http.createServer(...).listen() for local dev.
//   - backend/api/index.js wraps this with serverless-http for Vercel.
// Real-time verdict/scoreboard delivery moved from Socket.IO push to client
// polling (see routes/submissions.routes.js's GET /submit/status/:jobId and
// services/judgeService.js) specifically so this app has no long-lived state
// and can run as a stateless serverless function.
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
require('dotenv').config({ quiet: true });

// Check configuration before anything else loads — a missing secret should stop
// the boot here, not surface as a confusing failure on a student's first request.
require('./config/env').validateEnvOrExit();

const { apiLimiter } = require('./middleware/rateLimiter');

const authRoutes = require('./routes/auth.routes');
const submissionRoutes = require('./routes/submissions.routes');
const problemRoutes = require('./routes/problems.routes');
const aiRoutes = require('./routes/ai.routes');
const studentRoutes = require('./routes/student.routes');
const facultyRoutes = require('./routes/faculty.routes');
const contestRoutes = require('./routes/contest.routes');
const pdfExportRoutes = require('./routes/pdfExport.routes');
const judgeHealthRoutes = require('./routes/judgeHealth.routes');
const problemImportRoutes = require('./routes/problemImport.routes');
const ratingRoutes = require('./routes/rating.routes');
const twofaRoutes = require('./routes/twofa.routes');
const classroomRoutes = require('./routes/classroom.routes');
const proctorRoutes = require('./routes/proctor.routes');
const mcqRoutes = require('./routes/mcq.routes');
const examRoutes = require('./routes/exam.routes');
const profilesRoutes = require('./routes/profiles.routes');
const courseRoutes = require('./routes/courses.routes');
const roadmapRoutes = require('./routes/roadmaps.routes');

const { validateSubmission } = require('./middleware/security');

const app = express();

// Behind a reverse proxy (Caddy/Nginx) or Vercel's edge network — trust the
// first proxy hop so req.ip and X-Forwarded-For resolve correctly for rate limiting.
app.set('trust proxy', 1);

// ── CORS origins ──────────────────────────────────────────────────────────────
// CORS_ORIGIN may be a single origin or a comma-separated list (dev + prod domains).
// '*' allows all (dev fallback).
const corsOrigins = (process.env.CORS_ORIGIN || '*').split(',').map(s => s.trim()).filter(Boolean);
const corsOrigin = corsOrigins.includes('*') ? '*' : corsOrigins;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // handled by Vite in dev; configure per-env in prod
}));
app.use(cors({
  origin: corsOrigin,
  credentials: true
}));
app.use(express.json({ limit: '128kb' }));
app.use(morgan('dev'));
app.use('/api', apiLimiter);

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/faculty', facultyRoutes);
app.post('/api/submit', validateSubmission);
app.use('/api', submissionRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/contests', contestRoutes);
app.use('/api/pdf', pdfExportRoutes);
app.use('/api/judge-health', judgeHealthRoutes);
app.use('/api/problem-import', problemImportRoutes);
app.use('/api/rating', ratingRoutes);
app.use('/api/2fa', twofaRoutes);
app.use('/api/classrooms', classroomRoutes);
app.use('/api/proctor', proctorRoutes);
app.use('/api/mcq', mcqRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/profiles', profilesRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/roadmaps', roadmapRoutes);

// ── Health check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'CodeMentor API is running', timestamp: new Date().toISOString() });
});

// ── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ─────────────────────────────────────────────────────
// Express identifies an error handler by its four-argument shape, so `next` must
// stay even though it is unused.
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const status = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message || 'Internal server error';
  res.status(status).json({ success: false, error: message });
});

module.exports = app;
