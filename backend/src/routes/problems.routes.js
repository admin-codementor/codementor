const express = require('express');
const {
  getProblems,
  getProblemById,
  getAdjacentProblems
} = require('../controllers/problems.controller');

const { publicRoute } = require('../middleware/routeGuard');

const router = express.Router();

// Open by design, and declared so the audit stops flagging it. What it serves
// is title, tags, difficulty and acceptance — never test cases or solutions,
// which load through authenticated routes. Worth revisiting if a college wants
// its question bank private; nothing in the app depends on it being open.
router.use(publicRoute('read-only problem catalogue: titles, tags and difficulty only'));

// Read-only public problem catalogue.
// NOTE: problem creation/update/deletion is handled exclusively by the
// authenticated, ownership-checked routes in faculty.routes.js
// (POST/PUT/DELETE /api/faculty/problems). The previously-exposed
// unauthenticated write routes here have been removed.
router.get('/', getProblems);

// Adjacent must be before /:id so it isn't captured as an ID.
router.get('/:id/adjacent', getAdjacentProblems);

router.get('/:id', getProblemById);

module.exports = router;
