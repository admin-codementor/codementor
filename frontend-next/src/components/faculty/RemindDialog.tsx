"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/components/feedback/ToastProvider";

const MAX = 200;

/**
 * Sends an in-app reminder to a set of students. The server skips anyone already reminded by you in the last day and anyone
 * outside your students, and says how many were skipped, so a double click cannot nag.
 */
export function RemindDialog({ open, onClose, studentIds, defaultMessage, what }: { open: boolean; onClose: () => void; studentIds: string[]; defaultMessage: string; what: string }) {
  const toast = useToast();
  const [message, setMessage] = React.useState(defaultMessage);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { if (open) { setMessage(defaultMessage); setError(null); } }, [open, defaultMessage]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ success: boolean; data: { sent: number; skippedRecently: number; skippedNotYours: number } }>("/api/faculty/nudges", { studentIds, message });
      const d = res.data.data;
      const extra = d.skippedRecently ? ` ${d.skippedRecently} already got a reminder from you today.` : "";
      toast(d.sent ? `Reminder sent to ${d.sent} student${d.sent === 1 ? "" : "s"}.${extra}` : `Nobody was reminded.${extra}`, { severity: d.sent ? "success" : "info" });
      onClose();
    } catch (e) {
      setError(apiErrorMessage(e, "Could not send the reminder."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="remind-title">
      <DialogTitle id="remind-title">Remind {studentIds.length} student{studentIds.length === 1 ? "" : "s"}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {what} They see this on their dashboard under your name. A student can be reminded by you once a day.
        </Typography>
        <TextField label="Message" value={message} onChange={(e) => setMessage(e.target.value)} multiline minRows={2} fullWidth slotProps={{ htmlInput: { maxLength: MAX } }} helperText={`${message.length} / ${MAX}`} />
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={send} disabled={busy || message.trim().length < 3 || studentIds.length === 0}>{busy ? "Sending…" : "Send reminder"}</Button>
      </DialogActions>
    </Dialog>
  );
}
