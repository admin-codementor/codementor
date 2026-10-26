// The in-memory limiter that backs the Redis limiters when Redis is down.
const { createMemoryLimiter } = require('../../src/utils/memoryLimiter');

module.exports = function (s) {
  let t = 1_000_000;
  const clock = () => t;
  const lim = createMemoryLimiter({ max: 3, windowMs: 10_000, now: clock });

  const a = [lim.check('u1'), lim.check('u1'), lim.check('u1'), lim.check('u1')];
  s.check('allows up to max inside the window, then refuses', a.map((x) => x.success).join() === 'true,true,true,false');
  s.check('remaining counts down to zero', a[0].remaining === 2 && a[2].remaining === 0 && a[3].remaining === 0);
  s.check('keys are independent: one student does not use up another\'s allowance', lim.check('u2').success === true);

  t += 10_001;
  s.check('after the window passes the key is allowed again', lim.check('u1').success === true);

  t += 4_000;
  const sliding = createMemoryLimiter({ max: 2, windowMs: 10_000, now: clock });
  sliding.check('k'); t += 6_000; sliding.check('k');
  s.check('sliding window: the old hit expires before the newer one', sliding.check('k').success === false && (t += 4_500, sliding.check('k').success === true));

  // memory stays bounded under a flood of distinct keys
  const small = createMemoryLimiter({ max: 1, windowMs: 60_000, maxKeys: 100, now: clock });
  for (let i = 0; i < 1000; i++) small.check(`ip${i}`);
  s.check('a flood of distinct keys cannot grow memory without limit', small.size() <= 200, `size ${small.size()}`);

  // an expired-only map is emptied
  const e = createMemoryLimiter({ max: 1, windowMs: 1_000, now: clock });
  e.check('x'); e.check('y'); t += 5_000; e.check('z');
  s.check('expired keys are dropped', e.size() === 1);
};
