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
