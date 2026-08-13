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
  const e = err as AxiosError<{ error?: string; message?: string }> | undefined;

  const fromServer = e?.response?.data?.error || e?.response?.data?.message;
  if (fromServer) return fromServer;

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
