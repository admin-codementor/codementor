const axios = require('axios');

const JUDGE0_URL = process.env.JUDGE0_URL || 'http://localhost:2358';

// Auth header sent on every Judge0 request — matches AUTHN_TOKEN in judge0.conf.
// Mirrors judge0Headers() in services/judgeService.js.
const judge0Headers = () => {
  const token = process.env.JUDGE0_AUTH_TOKEN;
  return token ? { 'X-Auth-Token': token } : {};
};

// GET /api/judge-health — faculty/admin only.
// Polls Judge0 /system_info, /about and /workers. Never throws: on any failure
// it returns online:false with the error message so the dashboard can render.
exports.getHealth = async (req, res) => {
  const headers = judge0Headers();
  const checked_at = new Date().toISOString();

  let online = false;
  let version = 'unknown';
  let workers = null;
  let system_info = null;
  let errorMessage = null;

  // /system_info is the primary liveness probe.
  try {
    const sysRes = await axios.get(`${JUDGE0_URL}/system_info`, { headers, timeout: 5000 });
    system_info = sysRes.data;
    online = true;
  } catch (err) {
    errorMessage =
      err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND'
        ? `Judge0 not reachable at ${JUDGE0_URL}`
        : err.message;
  }

  // /about carries the version string. Best-effort; failure leaves version unknown.
  if (online) {
    try {
      const aboutRes = await axios.get(`${JUDGE0_URL}/about`, { headers, timeout: 5000 });
      version = aboutRes.data?.version || system_info?.version || 'unknown';
    } catch (_) {
      version = system_info?.version || 'unknown';
    }
  }

  // /workers reports per-queue worker availability. Best-effort.
  if (online) {
    try {
      const workersRes = await axios.get(`${JUDGE0_URL}/workers`, { headers, timeout: 5000 });
      workers = workersRes.data;
    } catch (_) {
      workers = null;
    }
  }

  return res.json({
    success: true,
    data: {
      online,
      version,
      workers,
      system_info,
      ...(errorMessage ? { error: errorMessage } : {}),
      checked_at,
    },
  });
};
