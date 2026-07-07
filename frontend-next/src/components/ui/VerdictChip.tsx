"use client";

import * as React from "react";
import Chip, { type ChipProps } from "@mui/material/Chip";
import { CheckCircleOutlineIcon, CancelOutlinedIcon, TimerOutlinedIcon, MemoryOutlinedIcon, BugReportOutlinedIcon, CodeOffOutlinedIcon, PendingOutlinedIcon } from "@/components/ui/icons";

interface VerdictStyle {
  label: string;
  bg: string;
  color: string;
  Icon: React.ElementType;
}

function getVerdictStyle(verdict: string): VerdictStyle {
  const v = verdict?.trim() ?? "";
  if (v === "Accepted")
    return { label: "Accepted", bg: "successContainer", color: "onSuccessContainer", Icon: CheckCircleOutlineIcon };
  if (v === "Wrong Answer")
    return { label: "Wrong Answer", bg: "errorContainer", color: "onErrorContainer", Icon: CancelOutlinedIcon };
  if (v === "Time Limit Exceeded")
    return { label: "TLE", bg: "warningContainer", color: "onWarningContainer", Icon: TimerOutlinedIcon };
  if (v === "Memory Limit Exceeded")
    return { label: "MLE", bg: "warningContainer", color: "onWarningContainer", Icon: MemoryOutlinedIcon };
  if (v === "Runtime Error")
    return { label: "Runtime Error", bg: "errorContainer", color: "onErrorContainer", Icon: BugReportOutlinedIcon };
  if (v === "Compilation Error")
    return { label: "Compile Error", bg: "warningContainer", color: "onWarningContainer", Icon: CodeOffOutlinedIcon };
  if (v === "Pending" || v === "Running")
    return { label: v, bg: "secondaryContainer", color: "onSecondaryContainer", Icon: PendingOutlinedIcon };
  return { label: v || "Unknown", bg: "surfaceContainerHigh", color: "onSurfaceVariant", Icon: PendingOutlinedIcon };
}

/**
 * Displays a code submission verdict as a tonal chip with a semantic icon.
 * Color conveys verdict category: green=accepted, red=wrong, amber=limit/compile.
 */
export function VerdictChip({
  verdict,
  size = "small",
}: {
  verdict: string;
  size?: ChipProps["size"];
}) {
  const { label, bg, color, Icon } = getVerdictStyle(verdict);
  return (
    <Chip
      size={size}
      label={label}
      icon={<Icon sx={{ fontSize: "0.9rem !important" }} />}
      sx={{
        bgcolor: bg,
        color,
        fontWeight: 500,
        "& .MuiChip-icon": { color: "inherit" },
      }}
    />
  );
}
