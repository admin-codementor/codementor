"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * One QueryClient per browser tab (not per render) — created lazily in
 * `useState` so it survives re-renders but isn't shared across SSR requests.
 * `staleTime` is deliberately non-zero: without it, every mount (including a
 * remount) refetches immediately even if data was fetched seconds ago, which
 * defeats the point of caching for a nav-heavy app like this one.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // The axios client in `lib/api.ts` already retries the underlying
        // request once via its own 401-refresh flow — an additional retry
        // layer on top just delays surfacing a real error. A 4xx is the
        // server's considered answer, so retrying it only doubles the wait
        // before the student sees what went wrong.
        // A failure on our side or on the network is tried again, twice, with a growing wait (1 s, then 2 s), because most of them pass in
        // seconds (a server restarting, a signal dropping). A 429 is the exception among the 4xx: it means "a little too fast", so it waits too.
        retry: (failureCount, error) => {
          const status = (error as { response?: { status?: number } })?.response?.status;
          if (status === 429) return failureCount < 2;
          if (status !== undefined && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        // Without this, a query that fails while React Query believes the
        // browser is offline sits in `fetchStatus: "paused"` forever: no data,
        // no error, and a page that renders nothing at all. It is not reliable
        // either — we have seen it pause with `navigator.onLine === true`.
        // We would rather run the request and report what actually happened;
        // `classifyApiError` already tells a network failure apart from a
        // server one and says so in the error state.
        networkMode: "always",
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(makeQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
