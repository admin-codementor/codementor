"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";

export interface ActivityHeatmapPoint {
  date: string;
  count: number;
}

function level(count: number) {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  return 3;
}

// Monotonic primary-hue intensity ramp (empty → strongest). The mid step is a
// color-mix between the container and main roles so the gradient reads as one hue.
const BG_BY_LEVEL = [
  "surfaceContainerHighest",
  "primaryContainer",
  "color-mix(in srgb, var(--mui-palette-primary-main) 55%, var(--mui-palette-primaryContainer))",
  "primary.main",
];

/**
 * Submission activity heatmap. `days<=31` renders one row (dashboard's 28-day
 * view); larger ranges (e.g. 365 for a full-profile view) render GitHub-style
 * week columns x 7 day rows so a year of activity stays legible.
 */
export function ActivityHeatmap({
  heatmap,
  days = 28,
}: {
  heatmap: ActivityHeatmapPoint[];
  days?: number;
}) {
  const cells = React.useMemo(() => {
    const map = new Map(heatmap.map((h) => [h.date, h.count]));
    const today = new Date();
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (days - 1 - i));
      const date = d.toISOString().split("T")[0];
      return { date, count: map.get(date) ?? 0 };
    });
  }, [heatmap, days]);

  const weekly = days > 31;
  const weeks = weekly ? Math.ceil(days / 7) : days;

  return (
    <Box>
      <Box
        role="img"
        aria-label={`Activity heatmap for the last ${days} days`}
        sx={
          weekly
            ? {
                display: "grid",
                gridAutoFlow: "column",
                gridTemplateRows: "repeat(7, 1fr)",
                gridTemplateColumns: `repeat(${weeks}, 1fr)`,
                gap: "3px",
                overflowX: "auto",
              }
            : {
                display: "grid",
                gridTemplateColumns: `repeat(${days}, 1fr)`,
                gap: "3px",
              }
        }
      >
        {cells.map(({ date, count }) => (
          <Tooltip
            key={date}
            title={
              count === 0
                ? `No submissions on ${date}`
                : `${count} submission${count !== 1 ? "s" : ""} on ${date}`
            }
            arrow
          >
            <Box
              sx={{
                aspectRatio: "1",
                minWidth: weekly ? 10 : undefined,
                borderRadius: 0.5,
                bgcolor: BG_BY_LEVEL[level(count)],
              }}
            />
          </Tooltip>
        ))}
      </Box>
      <Stack
        direction="row"
        justifyContent="flex-end"
        alignItems="center"
        spacing={0.75}
        sx={{ mt: 1 }}
      >
        <Typography variant="caption" color="text.secondary">
          Less
        </Typography>
        {BG_BY_LEVEL.map((bg, i) => (
          <Box
            key={i}
            aria-hidden
            sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: bg }}
          />
        ))}
        <Typography variant="caption" color="text.secondary">
          More
        </Typography>
      </Stack>
    </Box>
  );
}
