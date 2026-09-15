"use client";

import * as React from "react";
import Backdrop from "@mui/material/Backdrop";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { WarningAmberIcon, FullscreenIcon } from "@/components/ui/icons";

/**
 * Full-viewport, non-dismissible blocker shown while a proctored session is
 * outside fullscreen. Disappears the instant fullscreen is regained; if the
 * countdown reaches zero the caller auto-submits (this component just
 * displays the count — useProctor owns the timer and submit call).
 */
export function FullscreenGraceModal({
  secondsLeft,
  onReturn,
}: {
  secondsLeft: number | null;
  onReturn: () => void;
}) {
  if (secondsLeft == null) return null;
  return (
    <Backdrop
      open
      sx={{
        zIndex: (t) => t.zIndex.modal + 10,
        bgcolor: "color-mix(in srgb, var(--mui-palette-scrim, #000) 80%, transparent)",
        flexDirection: "column",
      }}
    >
      <Stack
        spacing={2}
        alignItems="center"
        sx={{
          bgcolor: "errorContainer",
          color: "onErrorContainer",
          borderRadius: 4,
          p: 4,
          maxWidth: 420,
          mx: 2,
          textAlign: "center",
          boxShadow: 8,
        }}
      >
        <WarningAmberIcon sx={{ fontSize: 40 }} />
        <Typography variant="h6" fontWeight={700}>
          You left fullscreen
        </Typography>
        <Typography variant="body2">
          Don&apos;t exit fullscreen during the exam. Return now or it will be submitted automatically.
        </Typography>
        <Typography
          variant="h2"
          fontWeight={700}
          sx={{ fontFamily: "ui-monospace, monospace", lineHeight: 1 }}
          aria-live="assertive"
        >
          {secondsLeft}s
        </Typography>
        <Button
          variant="contained"
          size="large"
          color="inherit"
          startIcon={<FullscreenIcon />}
          onClick={onReturn}
          sx={{ bgcolor: "onErrorContainer", color: "errorContainer", "&:hover": { bgcolor: "onErrorContainer", opacity: 0.9 } }}
        >
          Return to fullscreen
        </Button>
      </Stack>
    </Backdrop>
  );
}
