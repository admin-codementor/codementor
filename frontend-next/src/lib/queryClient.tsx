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
        // layer on top just delays surfacing a real error.
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(makeQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
