// The dependency audit gate: what blocks the build and what is accepted.
const { evaluate } = require('../../../scripts/audit-gate.cjs');

module.exports = function (s) {
  const today = new Date('2026-11-01');
  const vulns = {
    next: { name: 'next', severity: 'critical' },
    dompurify: { name: 'dompurify', severity: 'critical' },
    postcss: { name: 'postcss', severity: 'moderate' },
    sharp: { name: 'sharp', severity: 'high' },
  };
  const accepted = [{ package: 'dompurify', reason: 'pinned by monaco', review_by: '2026-12-01' }];

  const r = evaluate(vulns, accepted, today);
  s.check('an unlisted critical or high finding blocks', r.failures.map((f) => f.name).sort().join() === 'next,sharp');
  s.check('a listed finding with a reason and a future review date is accepted', r.acceptedOk.length === 1 && r.acceptedOk[0].name === 'dompurify');
  s.check('moderate and lower never block', !r.failures.some((f) => f.name === 'postcss'));

  const expired = evaluate({ dompurify: vulns.dompurify }, accepted, new Date('2027-01-01'));
  s.check('an acceptance past its review date blocks again, so it cannot be forgotten', expired.failures.length === 1 && /expired/.test(expired.failures[0].why));

  const noReason = evaluate({ dompurify: vulns.dompurify }, [{ package: 'dompurify', review_by: '2026-12-01' }], today);
  s.check('an acceptance with no reason is refused', noReason.failures.length === 1 && /reason/.test(noReason.failures[0].why));

  const stale = evaluate({}, accepted, today);
  s.check('an accepted entry that is no longer flagged is reported so it can be removed', stale.stale.join() === 'dompurify' && stale.failures.length === 0);
  s.check('an empty report passes', evaluate(undefined, [], today).failures.length === 0);
};
