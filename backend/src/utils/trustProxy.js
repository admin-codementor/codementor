// How many proxies sit in front of the app decides whether req.ip (used by rate limits and the exam network check) is the real client
// or something a client could forge. TRUST_PROXY is the number of hops (Render or Vercel: 1) or an address list. "true" trusts every
// hop, which lets any client forge its IP, so it is refused.
function parseTrustProxy(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return 1;
  const v = String(raw).trim();
  if (/^\d+$/.test(v)) return Number(v);
  if (/^(true|false)$/i.test(v)) throw new Error('TRUST_PROXY must be a number of hops or an address list, not true/false (true trusts everyone and lets clients forge their IP).');
  return v;
}

module.exports = { parseTrustProxy };
