import { redirect } from "next/navigation";

/**
 * Contests are no longer part of the student experience — they went unused, and
 * the decision was to take them out rather than keep a dead menu entry.
 *
 * Only the student-facing route is removed here. The contest collections,
 * routes and the Elo rating they feed are still in place, because rating also
 * drives the badge on profiles and the faculty views. Tearing that out is its
 * own piece of work with its own verification, not a footnote to this one.
 */
export default function ContestsRemoved() {
  redirect("/app/dashboard");
}
