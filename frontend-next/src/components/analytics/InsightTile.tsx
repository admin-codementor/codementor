"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ACCENT_CONTAINER, type Accent } from "./KpiTile";

/**
 * A named takeaway, not a number: "Strongest: Arrays", "Focus on: Recursion".
 * Pairs with KpiTiles in an Exam Performance block — the value is a topic
 * name, so it gets a tonal fill and room to wrap instead of a big numeral.
 */
export function InsightTile({
  icon,
  label,
  value,
  detail,
  accent = "success",
}: {
  icon: React.ReactNode;
  label: string;
  /** Topic / entity name. Shows "—" styling when nothing to report. */
  value?: string | null;
  detail?: React.ReactNode;
  accent?: Accent;
}) {
  const c = ACCENT_CONTAINER[accent];
  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        borderColor: "transparent",
        bgcolor: `var(--mui-palette-${c.bg})`,
        color: `var(--mui-palette-${c.fg})`,
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ p: 2.5, height: "100%" }}>
        <Box aria-hidden sx={{ display: "grid", placeItems: "center", flexShrink: 0 }}>
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="overline" sx={{ lineHeight: 1.4, opacity: 0.85 }}>
            {label}
          </Typography>
          <Typography variant="subtitle1" fontWeight={600} sx={{ lineHeight: 1.3, wordBreak: "break-word" }}>
            {value || "Not enough data yet"}
          </Typography>
          {detail && (
            <Typography variant="caption" sx={{ opacity: 0.85 }}>
              {detail}
            </Typography>
          )}
        </Box>
      </Stack>
    </Card>
  );
}
