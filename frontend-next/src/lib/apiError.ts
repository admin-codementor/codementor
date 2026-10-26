import type { AxiosError } from "axios";

/**
 * Turn an axios failure into a message worth showing a user.
 *
 * Pages used to swallow failures with `.catch(() => {})`, which made a 403 look
 * identical to a button that does nothing — that is exactly how the HOD's missing
 * role permissions were reported as "class creation is broken". Always surface
 * something.
 */
export interface ApiErrorInfo {
  status?: number;
  /** Stable machine-readable code from the server, e.g. NOT_FOUND, RATE_LIMITED, DATABASE_UNAVAILABLE. */
  code?: string;
  /** The server's plain-words explanation. */
  message?: string;
  /** What to do next, from the server. */
  hint?: string;
  /** The reference to quote. The server also logged the full technical error under this id. */
  requestId?: string;
}

/** The standard error fields (see backend/src/utils/apiError.js), read defensively: any of them may be missing. */
export function apiErrorInfo(err: unknown): ApiErrorInfo {
  const e = err as AxiosError<Record<string, unknown>> | undefined;
  const data = e?.response?.data;
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const header = e?.response?.headers?.["x-request-id"];
  return {
    status: e?.response?.status,
    code: str(data?.code),
    message: str(data?.error) ?? str(data?.message),
    hint: str(data?.hint),
    requestId: str(data?.requestId) ?? str(header),
  };
}

/** " (Reference ABCD1234)" for a server-side failure, so what someone reads out can be found in our logs. */
function referenceSuffix(err: unknown): string {
  const { status, requestId } = apiErrorInfo(err);
  return status && status >= 500 && requestId ? ` (Reference ${requestId})` : "";
}

export function apiErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const e = err as AxiosError<{ error?: unknown; message?: unknown }> | undefined;

  // Our own backend always sends `error`/`message` as strings. A platform-level
  // failure (e.g. a Vercel rewrite hitting a dead target) returns its own JSON
  // body instead, where these can be objects ({code, message}) — trusting the
  // TS cast without checking crashes any caller that renders this as JSX
  // (React error #31: objects are not valid as a child).
  const fromServer = e?.response?.data?.error ?? e?.response?.data?.message;
  if (typeof fromServer === "string" && fromServer) return fromServer + referenceSuffix(err);
  if (fromServer && typeof fromServer === "object" && "message" in fromServer) {
    const nested = (fromServer as { message?: unknown }).message;
    if (typeof nested === "string" && nested) return nested + referenceSuffix(err);
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
      return "The server had a problem. Please try again shortly." + referenceSuffix(err);
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
export type ErrorKind = "offline" | "server" | "busy" | "signedOut" | "forbidden" | "notFound" | "timeout" | "unknown";

export interface ClassifiedError {
  kind: ErrorKind;
  title: string;
  description: string;
  /** False when retrying cannot plausibly help (no permission, does not exist). */
  retryable: boolean;
  /** What to do next, from the server when it said. */
  hint?: string;
  /** The reference to quote, shown only for failures on our side. */
  reference?: string;
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
  busy: {
    title: "The system is busy right now",
    description: "Your work is safe. Wait a moment and try again.",
    retryable: true,
  },
  signedOut: {
    title: "Please sign in again",
    description: "Your session has ended.",
    retryable: false,
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

  const info = apiErrorInfo(err);
  const BUSY_CODES = ["UNAVAILABLE", "DATABASE_UNAVAILABLE", "CAPACITY", "AI_BUSY", "RATE_LIMITED", "UPSTREAM_UNAVAILABLE"];

  let kind: ErrorKind = "unknown";
  if (e?.code === "ECONNABORTED" || e?.code === "ETIMEDOUT") kind = "timeout";
  else if (typeof navigator !== "undefined" && navigator.onLine === false) kind = "offline";
  else if (!e?.response && e?.request) kind = "offline";
  else if (status === 401 || info.code === "SESSION_ENDED") kind = "signedOut";
  else if (status === 403) kind = "forbidden";
  else if (status === 404) kind = "notFound";
  else if (status === 429 || status === 503 || (info.code && BUSY_CODES.includes(info.code))) kind = "busy";
  else if (status && status >= 500) kind = "server";

  const shape = ERROR_SHAPES[kind];

  // Prefer what the server actually said — it's more specific than anything we
  // can guess. When there was no response at all (offline, timed out), there is
  // no server message, and apiErrorMessage() would wrongly report every such
  // case as "can't reach the server", including a timeout.
  const serverMessage = e?.response ? info.message ?? null : null;
  const showReference = !!info.requestId && (kind === "busy" || (typeof status === "number" && status >= 500));

  return {
    kind,
    ...shape,
    description: serverMessage ?? shape.description,
    hint: e?.response ? info.hint : undefined,
    reference: showReference ? info.requestId : undefined,
  };
}
