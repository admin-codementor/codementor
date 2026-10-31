"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import Alert from "@mui/material/Alert";
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

/**
 * "Report this problem" on an error screen. It sends the reference the screen showed, the page, the error code and a few words from the person,
 * so the Admin can find the exact line in the server log. Signed-out people (the sign-in page) cannot send one; the button is not shown to them.
 */
export function ReportProblemButton({ requestId, code, status, size = "small" }: { requestId?: string; code?: string; status?: number; size?: "small" | "medium" }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [state, setState] = React.useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = React.useState("");
  const [signedIn, setSignedIn] = React.useState(false);
  React.useEffect(() => { try { setSignedIn(!!localStorage.getItem("accessToken")); } catch { setSignedIn(false); } }, []);
  if (!signedIn) return null;

  const send = async () => {
    setState("sending"); setError("");
    try {
      await api.post("/api/problem-reports", { requestId, page: pathname, message, code, status });
      setState("sent");
    } catch (e) {
      setError(apiErrorMessage(e, "Your report could not be sent. Please try again in a minute."));
      setState("error");
    }
  };
  const needsWords = !requestId && message.trim().length < 5;

  return (
    <>
      <Button size={size} color="inherit" onClick={() => { setOpen(true); setState("idle"); }} sx={{ mt: 1 }}>Report this problem</Button>
      <Dialog open={open} onClose={state === "sending" ? undefined : () => setOpen(false)} fullWidth maxWidth="xs" aria-labelledby="report-title">
        <DialogTitle id="report-title">{state === "sent" ? "Thank you" : "Report this problem"}</DialogTitle>
        <DialogContent dividers>
          {state === "sent" ? (
            <Typography variant="body2">Your report was sent{requestId ? <> with the reference <b>{requestId}</b></> : ""}. Someone will look at it. You do not need to do anything else.</Typography>
          ) : (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">We will send the page you are on{requestId ? ` and the reference ${requestId}` : ""}. Add a few words about what you were doing, if you can.</Typography>
              <TextField size="small" multiline minRows={3} maxRows={6} label="What were you doing? (optional)" value={message} onChange={(e) => setMessage(e.target.value)} slotProps={{ htmlInput: { maxLength: 600 } }} helperText={`${message.length}/600`} />
              {state === "error" && <Alert severity="error">{error}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={state === "sending"}>{state === "sent" ? "Close" : "Cancel"}</Button>
          {state !== "sent" && <Button variant="contained" onClick={send} disabled={state === "sending" || needsWords}>{state === "sending" ? "Sending…" : "Send report"}</Button>}
        </DialogActions>
      </Dialog>
    </>
  );
}
