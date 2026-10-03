import type { Problem } from "./types";

/**
 * Deterministic "Problem of the Day": everyone sees the same pick on a given
 * calendar day, with no server state. Sorted by id first so the pick doesn't
 * change when the list order does. The caller shows a "solved" state if the
 * student already did it.
 */
export function pickProblemOfTheDay(problems: Problem[], day = new Date()): Problem | null {
  if (problems.length === 0) return null;
  const pool = [...problems].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const dayNumber = Math.floor(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) / 86400000);
  return pool[dayNumber % pool.length];
}
