import api from "@/lib/api";

/**
 * Polls the backend for a judging job's outcome. Replaces the old
 * Socket.IO "verdict" push — the backend now runs as stateless serverless
 * functions (see backend/src/services/judgeService.js) with no persistent
 * connection to push over, so the client polls GET /api/submit/status/:jobId
 * instead.
 *
 * Generic over the terminal payload shape so callers can use their own
 * VerdictPayload type directly instead of a separate polling-specific type.
 * Returns a cancel function — call it on unmount/teardown to stop polling.
 */
export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

// Minimal shape every terminal payload must satisfy — in-progress responses
// (status: "pending" | "retrying") are consumed internally and never passed
// to onDone.
interface Terminal {
  success: boolean;
  state: "completed" | "failed";
  error?: string;
}

export function pollUntilDone<T extends Terminal>(
  jobId: string,
  onDone: (payload: T) => void,
  options: PollOptions = {},
): () => void {
  const intervalMs = options.intervalMs ?? 700;
  const timeoutMs = options.timeoutMs ?? 60_000;
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const giveUp = setTimeout(() => {
    if (stopped) return;
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    onDone({ success: false, state: "failed", error: "Judging timed out. Please try again." } as T);
  }, timeoutMs);

  const tick = async () => {
    if (stopped) return;
    try {
      const res = await api.get<T & { status?: "pending" | "retrying" }>(`/api/submit/status/${jobId}`);
      if (stopped) return;
      const payload = res.data;
      if (payload.state === "completed" || payload.state === "failed") {
        stopped = true;
        clearTimeout(giveUp);
        onDone(payload);
        return;
      }
      // status: "pending" | "retrying" — keep polling.
      retryTimer = setTimeout(tick, intervalMs);
    } catch {
      if (stopped) return;
      // Transient network hiccup — keep polling rather than failing outright;
      // the overall timeout above still bounds how long this can go on.
      retryTimer = setTimeout(tick, intervalMs);
    }
  };

  tick();

  return () => {
    stopped = true;
    clearTimeout(giveUp);
    if (retryTimer) clearTimeout(retryTimer);
  };
}
