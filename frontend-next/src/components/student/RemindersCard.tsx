"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { NotificationsNoneOutlinedIcon } from "@/components/ui/icons";

interface Reminders { unread: number; items: { id: string; from: string; message: string; sentAt: string; unread: boolean }[] }

const key = ["student", "reminders"] as const;
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** Reminders a faculty member sent this student. Shows nothing when there are none, and only the unread ones are called out. */
export function RemindersCard() {
  const qc = useQueryClient();
  const q = useQuery<Reminders>({ queryKey: key, queryFn: async () => (await api.get<{ success: boolean; data: Reminders }>("/api/student/reminders")).data.data, staleTime: 60_000, retry: false });
  const read = useMutation({
    mutationFn: async () => api.post("/api/student/reminders/read"),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const d = q.data;
  // Only what is unread is shown on the dashboard; once marked read, a reminder leaves it.
  const unread = (d?.items ?? []).filter((i) => i.unread);
  if (!unread.length) return null;

  return (
    <Card variant="outlined" sx={{ p: 2, mb: 3, borderColor: "primary.main", bgcolor: "primaryContainer", color: "onPrimaryContainer" }} role="region" aria-label="Reminders from your faculty">
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <NotificationsNoneOutlinedIcon aria-hidden />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" fontWeight={700}>{unread.length === 1 ? "A reminder from your faculty" : `${unread.length} reminders from your faculty`}</Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {unread.map((r) => (
              <Typography key={r.id} variant="body2"><b>{r.from}</b> · {when(r.sentAt)}: {r.message}</Typography>
            ))}
          </Stack>
        </Box>
        <Button size="small" color="inherit" onClick={() => read.mutate()} disabled={read.isPending}>Dismiss</Button>
      </Stack>
    </Card>
  );
}
