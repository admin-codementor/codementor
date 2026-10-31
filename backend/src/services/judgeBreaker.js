// The one circuit breaker in front of every call to the code judge (see utils/circuitBreaker.js for the rules).
// Settings can be changed with JUDGE_BREAKER_FAILURES, JUDGE_BREAKER_WINDOW_MS and JUDGE_BREAKER_OPEN_MS.
const axios = require('axios');
const { createBreaker, CircuitOpenError } = require('../utils/circuitBreaker');

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

const breaker = createBreaker({
  failureThreshold: num(process.env.JUDGE_BREAKER_FAILURES, 5),
  windowMs: num(process.env.JUDGE_BREAKER_WINDOW_MS, 30_000),
  openMs: num(process.env.JUDGE_BREAKER_OPEN_MS, 20_000),
});

/** axios.post and axios.get, through the breaker. A refusal is a CircuitOpenError (code JUDGE_OPEN) and takes no time. */
const judgePost = (...args) => breaker.exec(() => axios.post(...args));
const judgeGet = (...args) => breaker.exec(() => axios.get(...args));

module.exports = { breaker, judgePost, judgeGet, CircuitOpenError };
