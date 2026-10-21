"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/components/feedback/ToastProvider";

export interface ReopenState { status: "pending" | "approved" | "declined"; until: string | null; note: string }

export type ReopenTarget = { assignmentId: string } | { courseId: string; moduleId: string };

const MIN = 10;
const MAX = 500;

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** One line saying where the student's request stands, or null when there is nothing to say. */
export function reopenSummary(r: ReopenState | null | undefined): string | null {
  if (!r) return null;
  if (r.status === "pending") return "Your request for more time is waiting for a decision.";
  if (r.status === "approved") return r.until ? `More time was approved: open until ${when(r.until)}.` : "More time was approved.";
  return `Your request was declined${r.note ? `: ${r.note}` : "."}`;
}

function RequestDialog({ open, onClose, target, title, onSent }: { open: boolean; onClose: () => void; target: ReopenTarget; title: string; onSent: () => void }) {
  const toast = useToast();
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/student/reopen-requests", {
        ...("assignmentId" in target ? { assignment_id: target.assignmentId } : { course_id: target.courseId, module_id: target.moduleId }),
        reason,
      });
      toast("Request sent. Your faculty will see it.", { severity: "success" });
      setReason("");
      onSent();
      onClose();
    } catch (e) {
      setError(apiErrorMessage(e, "Could not send the request."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="reopen-title">
      <DialogTitle id="reopen-title">Ask for more time</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            For <strong>{title}</strong>. Your faculty decides; if they say yes, you get a few more days and your work counts on time. Nobody else is affected.
          </Typography>
          <TextField
            label="Why do you need more time?" multiline minRows={3} value={reason} autoFocus
            onChange={(e) => setReason(e.target.value.slice(0, MAX))}
            helperText={`${reason.trim().length}/${MAX}. At least ${MIN} characters, and be specific.`}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={send} disabled={busy || reason.trim().length < MIN}>{busy ? "Sending…" : "Send request"}</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Under an overdue assignment or unit: where the request stands, or a button to make one. A request that was declined or
 * has already been approved can be followed by a new one; one that is waiting cannot.
 */
export function ReopenPanel({ target, title, state, onChanged, compact = false }: {
  target: ReopenTarget; title: string; state: ReopenState | null; onChanged: () => void; compact?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const summary = reopenSummary(state);
  return (
    <Box sx={{ p: compact ? 0 : 2, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
      {summary && (
        <Typography variant="body2" color={state?.status === "approved" ? "success.main" : state?.status === "declined" ? "error.main" : "text.secondary"} sx={{ flex: 1, minWidth: 220 }}>
          {summary}
        </Typography>
      )}
      {state?.status !== "pending" && (
        <Button size="small" variant="outlined" onClick={() => setOpen(true)}>
          {state ? "Ask again" : "Request more time"}
        </Button>
      )}
      <RequestDialog open={open} onClose={() => setOpen(false)} target={target} title={title} onSent={onChanged} />
    </Box>
  );
}
