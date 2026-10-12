"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

/**
 * A circular percentage — the roadmap.sh dashboard's signature, and a clearer
 * "how far along is this" at a glance than a linear bar once several cards
 * sit side by side in a grid. Same SVG-ring technique the Job-Ready Score
 * dial uses, pulled out here so a card grid isn't duplicating it a third
 * time as more pages want one.
 */
export function ProgressRing({
  percent,
  size = 56,
  stroke = 5,
  color = "primary",
  label,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  color?: "primary" | "success" | "warning" | "error";
  /** Centre text. Defaults to the percentage itself. */
  label?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <Box sx={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <Box
        component="svg"
        aria-hidden
        viewBox={`0 0 ${size} ${size}`}
        sx={{ width: size, height: size, transform: "rotate(-90deg)" }}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="var(--mui-palette-outlineVariant)" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={`var(--mui-palette-${color}-main)`}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </Box>
      <Stack sx={{ position: "absolute", inset: 0 }} alignItems="center" justifyContent="center">
        {label ?? (
          <Typography variant="caption" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums" }}>
            {clamped}%
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
