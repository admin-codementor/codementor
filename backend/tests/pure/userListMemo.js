// Account lists are kept for a few seconds: one read per window, not per request; copies are isolated; writes clear them.
module.exports = async function (s) {
  const fsPath = require.resolve('../../src/config/firestore');
  const repoPath = require.resolve('../../src/repositories/userRepository');
  const savedFs = require.cache[fsPath];
  const savedRepo = require.cache[repoPath];
  const savedEnv = process.env.USER_LIST_MEMO_MS;
  delete process.env.USER_LIST_MEMO_MS;

  let reads = 0;
  let failNext = false;
  const data = { students: new Map([['a', { name: 'Asha' }], ['b', { name: 'Bala' }]]), faculty: new Map([['f', { name: 'Fay', role: 'faculty' }]]) };
  const fakeDb = {
    collection: (c) => ({
      async get() {
        await new Promise((r) => setTimeout(r, 5));
        if (failNext) { failNext = false; throw new Error('db down'); }
        reads += data[c].size;
        return { docs: [...data[c]].map(([id, d]) => ({ id, exists: true, data: () => d })) };
      },
      doc: (id) => ({ async set(d, o) { data[c].set(id, o?.merge ? { ...data[c].get(id), ...d } : d); }, async get() { return { id, exists: data[c].has(id), data: () => data[c].get(id) }; } }),
    }),
  };
  require.cache[fsPath] = { id: fsPath, filename: fsPath, loaded: true, exports: { db: fakeDb } };
  delete require.cache[repoPath];
  try {
    const repo = require(repoPath);

    const first = await repo.getMapByRole('student');
    const second = await repo.getMapByRole('student');
    s.check('a second list inside the window costs no reads', reads === 2 && first.size === 2 && second.size === 2);

    first.get('a').name = 'CHANGED';
    s.check('changing a returned account does not change what others get', (await repo.getMapByRole('student')).get('a').name === 'Asha');

    s.check('students and everyone else are separate lists', (await repo.listByRole('faculty')).length === 1 && reads === 3);
    s.check('both lists together come from the same two reads', (await repo.getAllUsersMap()).size === 3 && reads === 3);

    await repo.update('a', 'student', { name: 'Asha K' });
    s.check('a write through the repository clears the lists at once', (await repo.getMapByRole('student')).get('a').name === 'Asha K' && reads === 5);

    repo.invalidateLists();
    const before = reads;
    await Promise.all(Array.from({ length: 20 }, () => repo.getMapByRole('student')));
    s.check('twenty simultaneous requests share one read of the collection', reads - before === 2);

    repo.invalidateLists();
    failNext = true;
    let failed = false;
    try { await repo.getMapByRole('student'); } catch { failed = true; }
    s.check('a failed read is reported', failed === true);
    s.check('and is not remembered: the next request reads again', (await repo.getMapByRole('student')).size === 2);
  } finally {
    delete require.cache[repoPath];
    if (savedRepo) require.cache[repoPath] = savedRepo;
    if (savedFs) require.cache[fsPath] = savedFs; else delete require.cache[fsPath];
    if (savedEnv !== undefined) process.env.USER_LIST_MEMO_MS = savedEnv;
  }
};
