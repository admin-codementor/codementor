"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { CheckCircleIcon, LockOutlinedIcon, PauseOutlinedIcon, RefreshIcon } from "@/components/ui/icons";

function Centered({ icon, tone, title, children, actions }: { icon: React.ReactNode; tone: "primary" | "warning" | "success"; title: string; children: React.ReactNode; actions: React.ReactNode }) {
  const bg = tone === "success" ? "successContainer" : tone === "warning" ? "warningContainer" : "primaryContainer";
  const fg = tone === "success" ? "onSuccessContainer" : tone === "warning" ? "onWarningContainer" : "onPrimaryContainer";
  return (
    <Box role="alert" sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", p: 3, bgcolor: "background.default" }}>
      <Stack alignItems="center" spacing={2} sx={{ textAlign: "center", maxWidth: 460 }}>
        <Box sx={{ width: 64, height: 64, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: bg, color: fg }}>{icon}</Box>
        <Typography variant="h5" component="h1" fontWeight={700}>{title}</Typography>
        <Typography variant="body1" color="text.secondary">{children}</Typography>
        <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>{actions}</Stack>
      </Stack>
    </Box>
  );
}

/** This tab lost the exam to another window or device. It cannot write any more, and says so instead of failing quietly. */
export function ReplacedScreen({ onTakeBack, onLeave, busy }: { onTakeBack: () => void; onLeave: () => void; busy: boolean }) {
  return (
    <Centered
      tone="warning" icon={<PauseOutlinedIcon fontSize="large" />} title="This exam is open in another window"
      actions={<>
        <Button variant="contained" onClick={onTakeBack} disabled={busy}>{busy ? "Switching…" : "Use this window instead"}</Button>
        <Button variant="outlined" onClick={onLeave}>Leave</Button>
      </>}
    >
      You opened this exam on another device or tab, so that one is now the active one. Your answers are saved. Choose this window only if you want to continue here; the other one will stop.
    </Centered>
  );
}

/** Paused after too many violations. Polls for the staff decision, so a resumed student does not have to do anything. */
export function LockedScreen({ count, onCheck, checking }: { count: number | null; onCheck: () => void; checking: boolean }) {
  return (
    <Centered
      tone="warning" icon={<LockOutlinedIcon fontSize="large" />} title="Your exam is paused"
      actions={<Button variant="contained" startIcon={<RefreshIcon />} onClick={onCheck} disabled={checking}>{checking ? "Checking…" : "Check again"}</Button>}
    >
      {count ? `You left the exam screen ${count} times. ` : ""}Your answers are saved and your timer keeps running. Tell your invigilator or faculty: they can resume you. This page continues on its own once you are resumed.
    </Centered>
  );
}

/** After finishing: what happened, when, and that it is safe. */
export function CompletedPanel({ title, receipt, auto }: { title: string; receipt: string | null; auto: boolean }) {
  return (
    <Stack alignItems="center" spacing={1.5} sx={{ textAlign: "center", py: 4 }}>
      <Box sx={{ width: 64, height: 64, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: "successContainer", color: "onSuccessContainer" }}>
        <CheckCircleIcon fontSize="large" />
      </Box>
      <Typography variant="h5" component="h1" fontWeight={700} color="success.main">Your test has been marked as completed</Typography>
      <Typography variant="body2" color="text.secondary">{title}</Typography>
      {receipt && <Typography variant="body2" color="text.secondary">{auto ? "Time ran out and your saved answers were submitted at" : "Submitted at"} {receipt}. All your answers are saved.</Typography>}
    </Stack>
  );
}
