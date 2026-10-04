import type { AxiosError } from "axios";

/**
 * Turn an axios failure into a message worth showing a user.
 *
 * Pages used to swallow failures with `.catch(() => {})`, which made a 403 look
 * identical to a button that does nothing — that is exactly how the HOD's missing
 * role permissions were reported as "class creation is broken". Always surface
 * something.
 */
export function apiErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const e = err as AxiosError<{ error?: unknown; message?: unknown }> | undefined;

  // Our own backend always sends `error`/`message` as strings. A platform-level
  // failure (e.g. a Vercel rewrite hitting a dead target) returns its own JSON
  // body instead, where these can be objects ({code, message}) — trusting the
  // TS cast without checking crashes any caller that renders this as JSX
  // (React error #31: objects are not valid as a child).
  const fromServer = e?.response?.data?.error ?? e?.response?.data?.message;
  if (typeof fromServer === "string" && fromServer) return fromServer;
  if (fromServer && typeof fromServer === "object" && "message" in fromServer) {
    const nested = (fromServer as { message?: unknown }).message;
    if (typeof nested === "string" && nested) return nested;
  }

  switch (e?.response?.status) {
    case 401:
      return "Your session expired. Please sign in again.";
    case 403:
      return "You don't have permission to do that.";
    case 404:
      return "Not found — it may have been deleted.";
    case 409:
      return "That conflicts with something that already exists.";
    case 429:
      return "Too many requests. Please wait a moment and try again.";
    case 500:
    case 502:
    case 503:
      return "The server had a problem. Please try again shortly.";
    default:
      break;
  }

  // No response at all — network down, or the backend isn't running.
  if (e?.request) return "Can't reach the server. Check your connection and try again.";

  return fallback;
}

/**
 * What kind of failure this is. The UI treats these differently: an offline
 * error is worth retrying automatically, a 403 is not, and a 404 should offer a
 * way back rather than a retry button that will fail again.
 */
export type ErrorKind = "offline" | "server" | "forbidden" | "notFound" | "timeout" | "unknown";

export interface ClassifiedError {
  kind: ErrorKind;
  title: string;
  description: string;
  /** False when retrying cannot plausibly help (no permission, does not exist). */
  retryable: boolean;
}

const ERROR_SHAPES: Record<ErrorKind, Omit<ClassifiedError, "kind">> = {
  offline: {
    title: "You're offline",
    description: "Check your connection — this will work again once you're back.",
    retryable: true,
  },
  server: {
    title: "The server had a problem",
    description: "This isn't something you did. Please try again in a moment.",
    retryable: true,
  },
  forbidden: {
    title: "You don't have access to this",
    description: "If you think you should, ask your faculty to check your account.",
    retryable: false,
  },
  notFound: {
    title: "This isn't here any more",
    description: "It may have been deleted or moved.",
    retryable: false,
  },
  timeout: {
    title: "This is taking longer than usual",
    description: "The server is slow to answer right now. Try again in a moment.",
    retryable: true,
  },
  unknown: {
    title: "Something went wrong",
    description: "Please try again.",
    retryable: true,
  },
};

/** Classifies a failure so a component can show the right state, not just a message. */
export function classifyApiError(err: unknown): ClassifiedError {
  const e = err as (AxiosError & { code?: string }) | undefined;
  const status = e?.response?.status;

  let kind: ErrorKind = "unknown";
  if (e?.code === "ECONNABORTED" || e?.code === "ETIMEDOUT") kind = "timeout";
  else if (typeof navigator !== "undefined" && navigator.onLine === false) kind = "offline";
  else if (!e?.response && e?.request) kind = "offline";
  else if (status === 401 || status === 403) kind = "forbidden";
  else if (status === 404) kind = "notFound";
  else if (status && status >= 500) kind = "server";

  const shape = ERROR_SHAPES[kind];

  // Prefer what the server actually said — it's more specific than anything we
  // can guess. When there was no response at all (offline, timed out), there is
  // no server message, and apiErrorMessage() would wrongly report every such
  // case as "can't reach the server", including a timeout.
  const serverMessage = e?.response ? apiErrorMessage(err, shape.description) : null;

  return { kind, ...shape, description: serverMessage ?? shape.description };
}
