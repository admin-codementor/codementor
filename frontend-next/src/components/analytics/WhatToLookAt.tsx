"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { TipsAndUpdatesOutlinedIcon } from "@/components/ui/icons";

export interface Insight { key?: string; severity: "high" | "medium" | "low"; title: string; detail: string }

const SEVERITY = { high: "error", medium: "warning", low: "info" } as const;

/** Plain-language findings, worst first. Each is one sentence plus what to do about it. Renders nothing when empty. */
export function WhatToLookAt({ insights, title = "What to look at" }: { insights: Insight[]; title?: string }) {
  if (insights.length === 0) return null;
  return (
    <Stack spacing={1.5} sx={{ mb: 3 }}>
      <Typography variant="subtitle1" fontWeight={600}>{title}</Typography>
      {insights.map((i) => (
        <Alert key={i.key ?? i.title} severity={SEVERITY[i.severity]} icon={<TipsAndUpdatesOutlinedIcon fontSize="small" />}>
          <Typography variant="body2" fontWeight={600}>{i.title}</Typography>
          <Typography variant="caption">{i.detail}</Typography>
        </Alert>
      ))}
    </Stack>
  );
}
