// Storage for the background upkeep: the lease that lets one server at a time run a task, and the last self-check result.
const { db } = require('../config/firestore');
const { decideLease } = require('../utils/maintenanceRules');

const leaseDoc = (name) => db.collection('leases').doc(name);

/** Takes the lease for `name` if the rules allow (see decideLease). A transaction, so two servers cannot both take it. */
async function takeLease(name, owner, now, rule) {
  return db.runTransaction(async (tx) => {
    const d = await tx.get(leaseDoc(name));
    const verdict = decideLease(d.exists ? d.data() : null, owner, now, rule);
    if (verdict.take) tx.set(leaseDoc(name), verdict.next);
    return verdict;
  });
}
/** Lets go of the lease early (the task finished), keeping when it last ran. */
async function releaseLease(name, owner) {
  await db.runTransaction(async (tx) => {
    const d = await tx.get(leaseDoc(name));
    if (d.exists && d.data().owner === owner) tx.set(leaseDoc(name), { ...d.data(), untilMs: 0 });
  });
}

const checkDoc = () => db.collection('collegeSettings').doc('selfCheck');
async function saveSelfCheck(result) { await checkDoc().set(result); }
async function getSelfCheck() { const d = await checkDoc().get(); return d.exists ? d.data() : null; }

module.exports = { takeLease, releaseLease, saveSelfCheck, getSelfCheck };
