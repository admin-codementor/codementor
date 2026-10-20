// "What to look at" for one course: a few plain sentences a faculty member can act on, each with the rule behind it.
// Pure: it reads figures the course analytics already computed, so the sentences and the numbers cannot disagree.
//
// severity: 'high' needs action now, 'medium' is worth a look this week, 'low' is context or good news.

const DAY_MS = 86400000;
const QUIET_DAYS = 7;            // started, then no submission for this long
const STUCK_MIN_SUBMISSIONS = 5; // submitted this many times in the window and solved nothing in it
const LOW_UNIT_PERCENT = 40;     // a unit whose average student has solved less than this

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const ORDER = { high: 0, medium: 1, low: 2 };

/**
 * @param {object} a
 * @param {{students:number,totalProblems:number,completed:number,inProgress:number,notStarted:number}} a.summary
 * @param {{title:string,empty:boolean,avgPercent:number,solved:number,partial:number}[]} a.units
 * @param {{status:string,lastActiveMs:number|null,subsInWindow:number,solvedInWindow:number}[]} a.students
 * @param {{reasons:string[]}[]} a.flagged
 * @param {{subs:number}[]} a.daily  zero-filled series for the window, oldest first
 * @param {number} a.days
 * @param {number} a.now
 */
function buildCourseInsights({ summary, units, students, flagged, daily, days, now }) {
  const out = [];
  const total = summary.students;
  if (total === 0 || summary.totalProblems === 0) return out;

  if (summary.notStarted > 0) {
    const pct = Math.round((summary.notStarted / total) * 100);
    out.push({
      key: 'not_started', severity: pct >= 50 ? 'high' : pct >= 25 ? 'medium' : 'low',
      title: `${summary.notStarted} of ${total} students have not started this course`,
      detail: `That is ${pct}% of the class. Filter the table to "Not started" to see who, and message them.`,
    });
  }

  const quiet = students.filter((s) => s.status === 'in_progress' && s.lastActiveMs && now - s.lastActiveMs > QUIET_DAYS * DAY_MS);
  if (quiet.length > 0) {
    out.push({
      key: 'gone_quiet', severity: quiet.length / total >= 0.2 ? 'high' : 'medium',
      title: `${plural(quiet.length, 'student', 'students')} started but ${quiet.length === 1 ? 'has' : 'have'} been quiet for ${QUIET_DAYS}+ days`,
      detail: 'They were making progress and stopped. A short check-in now is easier than catching up later.',
    });
  }

  const stuck = students.filter((s) => s.subsInWindow >= STUCK_MIN_SUBMISSIONS && s.solvedInWindow === 0);
  if (stuck.length > 0) {
    out.push({
      key: 'stuck', severity: 'medium',
      title: `${plural(stuck.length, 'student', 'students')} submitted ${STUCK_MIN_SUBMISSIONS}+ times in the last ${days} days without solving anything`,
      detail: 'They are trying and not getting there. Open the question statistics for the problem they are on to see what is going wrong.',
    });
  }

  const lowest = units.filter((u) => !u.empty && (u.solved + u.partial) > 0).sort((a, b) => a.avgPercent - b.avgPercent)[0];
  if (lowest && lowest.avgPercent < LOW_UNIT_PERCENT) {
    out.push({
      key: 'low_unit', severity: 'low',
      title: `"${lowest.title}" is where progress is lowest`,
      detail: `The average student has solved ${lowest.avgPercent}% of it. Consider a class session on it, or check whether its first problems are too hard.`,
    });
  }

  if (flagged.length > 0) {
    out.push({
      key: 'flagged', severity: 'medium',
      title: `${plural(flagged.length, 'student is', 'students are')} flagged for suspicious activity`,
      detail: 'Repeated paste attempts or very similar code. A flag is a reason to look, not proof.',
    });
  }

  // Direction of activity: the later half of the window against the earlier half.
  const half = Math.floor(daily.length / 2);
  if (half >= 2) {
    const first = daily.slice(0, half).reduce((n, d) => n + d.subs, 0);
    const second = daily.slice(half).reduce((n, d) => n + d.subs, 0);
    if (first > 0 && second <= first * 0.5) {
      out.push({ key: 'falling', severity: 'medium', title: 'Activity is falling', detail: `Submissions in the latest ${daily.length - half} days are down ${Math.round((1 - second / first) * 100)}% on the ${half} days before.` });
    } else if (first > 0 && second >= first * 1.5) {
      out.push({ key: 'rising', severity: 'low', title: 'Activity is picking up', detail: `Submissions in the latest ${daily.length - half} days are up ${Math.round((second / first - 1) * 100)}% on the ${half} days before.` });
    }
  }

  if (summary.completed > 0) {
    out.push({
      key: 'completed', severity: 'low',
      title: `${plural(summary.completed, 'student has', 'students have')} completed the course`,
      detail: `${Math.round((summary.completed / total) * 100)}% of the class has solved every problem.`,
    });
  }

  return out.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]).slice(0, 6);
}

module.exports = { buildCourseInsights, QUIET_DAYS, STUCK_MIN_SUBMISSIONS, LOW_UNIT_PERCENT };
