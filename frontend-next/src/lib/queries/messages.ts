"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

/**
 * GET /api/messages/unread-count: conversations with something new, for the menu badge.
 * Checked once a minute while the tab is visible; a failed check just shows no badge.
 */
export function useUnreadMessages(enabled: boolean) {
  return useQuery<number>({
    queryKey: ["messages", "unread"],
    enabled,
    queryFn: async () => (await api.get<{ success: boolean; data: { count: number } }>("/api/messages/unread-count")).data.data.count,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 20_000,
    retry: false,
  });
}
