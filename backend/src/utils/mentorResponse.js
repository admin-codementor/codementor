// How quickly mentors answer their mentees, worked out from the thread records only (who spoke last and when), never from message text.
// A thread is "waiting" when the last message in it came from the mentee. Pure: the clock is passed in.
const HOUR_MS = 3600000;
const SLOW_HOURS = 48;

/**
 * @param {object} a
 * @param {{id: string}[]} a.mentors
 * @param {{id: string, mentorId?: string|null}[]} a.students
 * @param {{participants?: string[], lastMessageBy?: string, lastMessageAtMs?: number}[]} a.threads  every thread of those mentors
 * @param {number} a.now
 * @returns {Map<string, {threads: number, waiting: number, waiting_over_48h: number, longest_wait_hours: number | null}>}
 */
function buildMentorResponse({ mentors, students, threads, now }) {
  const menteesOf = new Map(mentors.map((m) => [m.id, new Set()]));
  for (const s of students) if (s.mentorId && menteesOf.has(s.mentorId)) menteesOf.get(s.mentorId).add(s.id);
  const out = new Map();
  for (const m of mentors) {
    let count = 0; let waiting = 0; let slow = 0; let longest = null;
    const seen = new Set();
    for (const t of threads) {
      const people = t.participants || [];
      if (!people.includes(m.id) || seen.has(t.id)) continue;
      const mentee = people.find((p) => menteesOf.get(m.id).has(p));
      if (!mentee) continue;
      seen.add(t.id);
      count += 1;
      if (t.lastMessageBy === mentee && t.lastMessageAtMs) {
        waiting += 1;
        const hours = Math.max(0, Math.floor((now - t.lastMessageAtMs) / HOUR_MS));
        if (hours >= SLOW_HOURS) slow += 1;
        if (longest === null || hours > longest) longest = hours;
      }
    }
    out.set(m.id, { threads: count, waiting, waiting_over_48h: slow, longest_wait_hours: longest });
  }
  return out;
}

module.exports = { buildMentorResponse, SLOW_HOURS };
