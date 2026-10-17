"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/components/feedback/ToastProvider";
import { useConfirm } from "@/components/feedback/ConfirmProvider";
import { EmptyState } from "@/components/ui/States";
import { CheckCircleOutlineIcon } from "@/components/ui/icons";
import { radius } from "@/theme/tokens";

interface Reported {
  id: string; reported_by: string; reported_at: string | null; reason: string;
  people: { id: string; name: string; role: string | null }[];
  messages: { id: string; from: string; body: string; sent_at: string }[];
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

/** Conversations someone has reported. An HOD sees their own department's; an admin sees all. */
export function ReportedMessages() {
  const qc = useQueryClient();
  const showToast = useToast();
  const confirm = useConfirm();

  const query = useQuery<Reported[]>({
    queryKey: ["messages", "reported"],
    queryFn: async () => (await api.get("/api/messages/reported")).data.data,
    staleTime: 30_000,
  });
  const resolve = useMutation({
    mutationFn: async (id: string) => api.patch(`/api/messages/reported/${id}`, {}),
    onSuccess: () => { showToast("Marked as reviewed", { severity: "success" }); qc.invalidateQueries({ queryKey: ["messages", "reported"] }); },
    onError: (e) => showToast(apiErrorMessage(e, "Could not update the report."), { severity: "error" }),
  });

  if (query.isError) return <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => query.refetch()}>Retry</Button>}>{apiErrorMessage(query.error, "Could not load reports.")}</Alert>;
  if (query.isLoading) return <Skeleton variant="rounded" height={200} />;
  const rows = query.data ?? [];
  if (rows.length === 0) {
    return (
      <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
        <EmptyState icon={<CheckCircleOutlineIcon />} title="Nothing to review" description="Conversations that someone reports appear here. No other private message is ever shown." />
      </Card>
    );
  }
  return (
    <Stack spacing={2}>
      <Alert severity="warning" variant="outlined">
        These conversations were reported by a participant, so you can read them. Handle what you read with care, and mark each report as reviewed when it is dealt with.
      </Alert>
      {rows.map((r) => (
        <Card key={r.id} variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="space-between" sx={{ p: 2 }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>{r.people.map((p) => p.name).join(" and ")}</Typography>
              <Typography variant="caption" color="text.secondary">Reported by {r.reported_by} on {when(r.reported_at)}</Typography>
              {r.reason && <Typography variant="body2" sx={{ mt: 0.5 }}>Reason: {r.reason}</Typography>}
            </Box>
            <Button
              variant="outlined" size="small" disabled={resolve.isPending} sx={{ alignSelf: { sm: "flex-start" } }}
              onClick={async () => { if (await confirm({ title: "Mark as reviewed?", description: "It leaves this list. The conversation itself stays blocked for the person who reported it.", confirmLabel: "Mark reviewed" })) resolve.mutate(r.id); }}
            >
              Mark reviewed
            </Button>
          </Stack>
          <Stack spacing={1} sx={{ p: 2, pt: 0, maxHeight: 320, overflowY: "auto" }}>
            {r.messages.map((m) => (
              <Box key={m.id} sx={{ px: 1.5, py: 1, borderRadius: radius.md, bgcolor: "surfaceContainerHighest", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{m.from} · {when(m.sent_at)}</Typography>
                <Typography variant="body2">{m.body}</Typography>
              </Box>
            ))}
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}
