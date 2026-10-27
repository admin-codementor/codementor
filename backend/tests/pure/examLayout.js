// Per-student question and option order (utils/examLayout.js).
const L = require('../../src/utils/examLayout');

const q = (id, options) => ({ id, options: options || ['alpha', 'beta', 'gamma', 'delta'], correctIndex: 1 });

module.exports = async function (s) {
  const questions = Array.from({ length: 30 }, (_, i) => q(`q${i}`));
  const layout = L.buildLayout([{ id: 'sec', questions }]);
  const sl = layout.sections.sec;

  s.check('the layout holds every question once, in some order', sl.order.length === 30 && new Set(sl.order).size === 30 && questions.every((x) => sl.order.includes(x.id)));
  s.check('every option order is a real permutation of the options', questions.every((x) => L.isPermutation(sl.options[x.id], 4)));
  s.check('the order is not simply the original order (30 questions)', JSON.stringify(sl.order) !== JSON.stringify(questions.map((x) => x.id)));

  // two students almost never get the same order
  const a = L.buildLayout([{ id: 'sec', questions }]).sections.sec.order.join();
  const b = L.buildLayout([{ id: 'sec', questions }]).sections.sec.order.join();
  s.check('two students get different orders', a !== b);

  // shuffling is not biased: over many runs, every question lands first about equally often
  const firsts = new Map();
  const small = Array.from({ length: 4 }, (_, i) => q(`s${i}`));
  for (let i = 0; i < 4000; i += 1) {
    const f = L.buildLayout([{ id: 'x', questions: small }]).sections.x.order[0];
    firsts.set(f, (firsts.get(f) || 0) + 1);
  }
  s.check('the shuffle is roughly uniform (each of 4 questions first about a quarter of the time)', [...firsts.values()].every((n) => n > 800 && n < 1200) && firsts.size === 4);

  // translating an answer back and forth never changes which option it is
  let roundTrip = true;
  for (const x of questions) {
    const perm = L.permFor(sl, x.id, 4);
    for (let d = 0; d < 4; d += 1) {
      const original = L.toOriginal(perm, d);
      if (L.toDisplayed(perm, original) !== d) roundTrip = false;
      if (L.displayOptions(x.options, perm)[d] !== x.options[original]) roundTrip = false;
    }
  }
  s.check('displayed option d is always the original option toOriginal(d), and back', roundTrip);

  // arranging
  const arranged = L.arrange(questions, sl);
  s.check('arrange gives all questions in the stored order', arranged.length === 30 && arranged.map((x) => x.question.id).join() === sl.order.join());
  const first = arranged[0];
  const shown = L.displayOptions(first.question.options, first.perm);
  s.check('the option that is correct in the original list is found at its displayed position', shown[L.toDisplayed(first.perm, first.question.correctIndex)] === first.question.options[first.question.correctIndex]);

  // a question added after the layout was made goes last; a removed one is dropped
  const edited = questions.filter((x) => x.id !== 'q3').concat([q('qNew')]);
  const reArranged = L.arrange(edited, sl);
  s.check('a question added later is shown last and a removed one is dropped', reArranged[reArranged.length - 1].question.id === 'qNew' && !reArranged.some((x) => x.question.id === 'q3') && reArranged.length === 30);
  s.check('a new question has no stored option order, so it shows in its written order', reArranged[reArranged.length - 1].perm === null);

  // options changed after the layout was made: the stored order no longer fits, so the written order is used (never a wrong mapping)
  const fewer = [{ id: 'q0', options: ['alpha', 'beta'] }];
  s.check('an option list that changed size ignores the stored order', L.arrange(fewer, sl)[0].perm === null);

  // fixed-order options
  s.check('"All of the above" keeps the written option order', L.needsFixedOptionOrder(['red', 'blue', 'green', 'All of the above']));
  s.check('"Both A and B" keeps the written option order', L.needsFixedOptionOrder(['x', 'y', 'Both A and B', 'none']) && L.needsFixedOptionOrder(['None of these', 'a', 'b']));
  s.check('ordinary options may be shuffled', !L.needsFixedOptionOrder(['O(n)', 'O(log n)', 'O(1)', 'O(n^2)']) && !L.needsFixedOptionOrder(['Paris', 'Rome', 'Berlin', 'Madrid']));
  const mixed = L.buildLayout([{ id: 's', questions: [q('fixed', ['a', 'b', 'All of the above', 'None']), q('free')] }]).sections.s;
  s.check('a question with positional options has no option shuffle, but is still placed in the shuffled order', mixed.options.fixed === undefined && mixed.options.free !== undefined && mixed.order.length === 2);
  s.check('a question with fewer than 2 options is never shuffled', L.buildLayout([{ id: 's', questions: [q('one', ['only'])] }]).sections.s.options.one === undefined);

  // saved state is translated for display
  const perms = new Map(questions.map((x) => [x.id, L.permFor(sl, x.id, 4)]));
  const state = { q0: { status: 'answered', selectedIndex: 2, sectionId: 'sec' }, q1: { status: 'visited', selectedIndex: null, sectionId: 'sec' } };
  const shownState = L.displayState(state, perms);
  s.check('saved choices are translated to what the student sees, and non-answers are left alone', shownState.q0.selectedIndex === L.toDisplayed(perms.get('q0'), 2) && shownState.q1.selectedIndex === null && shownState.q0.status === 'answered');

  // the layout can be stored: maps of arrays only (no array inside an array), and it is plain JSON
  const json = JSON.stringify(layout);
  s.check('the layout is plain JSON with no array inside an array (Firestore-safe)', JSON.parse(json).v === 1 && !Object.values(sl.options).some((p) => p.some(Array.isArray)) && !Array.isArray(sl.order[0]));
  s.check('no mcq section means an empty layout, not an error', Object.keys(L.buildLayout([]).sections).length === 0 && Object.keys(L.buildLayout(undefined).sections).length === 0);
};
