/**
 * The exam session of this browser tab.
 *
 * Starting an exam makes this tab the one that may write to the attempt; the server hands back a session id, and every change the tab
 * makes carries it (header X-Exam-Session). Opening the exam in another tab or on another device claims a new session and this one is
 * told, on its next save, that it was replaced.
 *
 * Kept in sessionStorage: it belongs to ONE tab, survives a reload and the trip to the code editor and back (same tab), and is gone
 * when the tab closes.
 */
const sessionKey = (examId: string) => `exam-session:${examId}`;
const seqKey = (examId: string) => `exam-seq:${examId}`;

const read = (key: string): string | null => {
  try { return typeof window === "undefined" ? null : window.sessionStorage.getItem(key); } catch { return null; }
};
const write = (key: string, value: string | null) => {
  try {
    if (typeof window === "undefined") return;
    if (value === null) window.sessionStorage.removeItem(key); else window.sessionStorage.setItem(key, value);
  } catch { /* storage blocked: the exam still works, a reload will just claim a new session */ }
};

export function getExamSession(examId: string): string | null {
  return read(sessionKey(examId));
}

/** A new session also restarts the sequence numbers (the server counts them per session). */
export function setExamSession(examId: string, sessionId: string): void {
  write(sessionKey(examId), sessionId);
  write(seqKey(examId), "0");
}

export function clearExamSession(examId: string): void {
  write(sessionKey(examId), null);
  write(seqKey(examId), null);
}

/** The next save number: rises by one on every save from this tab, so a delayed older save can never overwrite a newer one. */
export function nextExamSeq(examId: string): number {
  const n = Number(read(seqKey(examId)) ?? "0") + 1;
  write(seqKey(examId), String(n));
  return n;
}

/** Request headers that carry this tab's session, or undefined when it has none (an older attempt). */
export function examHeaders(examId: string): Record<string, string> | undefined {
  const s = getExamSession(examId);
  return s ? { "X-Exam-Session": s } : undefined;
}

/** The server's answer codes that mean "this attempt will not accept more changes from this tab". */
export const EXAM_STOP_CODES = ["SESSION_REPLACED", "SESSION_REQUIRED", "EXAM_LOCKED", "TIME_UP", "ALREADY_SUBMITTED"] as const;
export type ExamStopCode = (typeof EXAM_STOP_CODES)[number];

export function examStopCode(err: unknown): ExamStopCode | null {
  const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
  return (EXAM_STOP_CODES as readonly string[]).includes(code ?? "") ? (code as ExamStopCode) : null;
}
