const express = require('express');
const axios = require('axios');
const { publicRoute } = require('../middleware/routeGuard');
const { createStatusService } = require('../services/systemStatus');

const router = express.Router();

// The real checks. Each is one cheap call; the service holds the answer for 30 seconds.
const firestorePing = async () => {
  const { db } = require('../config/firestore'); // loaded on first use so a missing credential cannot stop the app from starting
  await db.collection('_health').doc('ping').get(); // one read; the document does not need to exist
};
const judgePing = process.env.JUDGE0_URL
  ? async () => {
    const token = process.env.JUDGE0_AUTH_TOKEN;
    await axios.get(`${process.env.JUDGE0_URL}/system_info`, { timeout: 3000, headers: token ? { 'X-Auth-Token': token } : {} });
  }
  : null;

const service = createStatusService({ firestorePing, judgePing });

// GET /api/system-status. 200 when ok or degraded (the platform is reachable), 503 when the database is down, so a monitor that only
// looks at the status code alerts on the one case where nothing can be saved. The body says which part is down.
router.get('/', publicRoute('platform status for uptime monitors: api, database and judge reachability only, nothing sensitive'), async (req, res) => {
  const value = await service.get();
  res.set('Cache-Control', 'no-store');
  res.status(value.status === 'down' ? 503 : 200).json(value);
});

module.exports = router;
module.exports.service = service;
