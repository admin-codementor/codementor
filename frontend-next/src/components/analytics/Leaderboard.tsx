"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { ChartCard } from "./ChartCard";
import { ArrowDownUpIcon } from "@/components/ui/icons";

export interface LeaderboardRow {
  id: string | number;
  label: string;
  value: number;
  /** Secondary text beside the label (e.g. roll number, "42 students"). */
  hint?: string;
}

/**
 * Sortable horizontal-bar leaderboard ("Most active users / groups").
 * Plain MUI bars — no chart engine — so it is cheap to render beside every KPI
 * strip. The toggle flips most↔least, which is how faculty find who needs
 * attention rather than who is already fine.
 */
export function Leaderboard({
  title,
  subtitle,
  rows,
  unit = "",
  limit = 8,
  loading,
  onRowClick,
  emptyDescription,
}: {
  title: string;
  subtitle?: React.ReactNode;
  rows: LeaderboardRow[];
  unit?: string;
  limit?: number;
  loading?: boolean;
  onRowClick?: (row: LeaderboardRow) => void;
  emptyDescription?: React.ReactNode;
}) {
  const [desc, setDesc] = React.useState(true);
  const sorted = React.useMemo(
    () => [...rows].sort((a, b) => (desc ? b.value - a.value : a.value - b.value)).slice(0, limit),
    [rows, desc, limit],
  );
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      loading={loading}
      empty={rows.length === 0}
      emptyDescription={emptyDescription}
      height={Math.max(180, sorted.length * 44)}
      action={
        <Tooltip title={desc ? "Highest first — click to reverse" : "Lowest first — click to reverse"}>
          <IconButton size="small" aria-label="Reverse sort order" onClick={() => setDesc((d) => !d)}>
            <ArrowDownUpIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      }
    >
      <Stack spacing={1.5}>
        {sorted.map((r, i) => {
          const inner = (
            <>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
                <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
                  <Box component="span" sx={{ color: "text.secondary", mr: 1, fontVariantNumeric: "tabular-nums" }}>
                    {i + 1}
                  </Box>
                  {r.label}
                  {r.hint && (
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      {r.hint}
                    </Typography>
                  )}
                </Typography>
                <Typography variant="body2" fontWeight={600} sx={{ ml: 2, fontVariantNumeric: "tabular-nums" }}>
                  {r.value}
                  {unit}
                </Typography>
              </Stack>
              <Box sx={{ height: 8, borderRadius: 4, bgcolor: "surfaceContainerHighest", overflow: "hidden" }}>
                <Box sx={{ height: "100%", width: `${(r.value / max) * 100}%`, bgcolor: "primary.main", borderRadius: 4 }} />
              </Box>
            </>
          );
          return onRowClick ? (
            <Box
              key={r.id}
              component="button"
              type="button"
              onClick={() => onRowClick(r)}
              sx={{
                all: "unset",
                boxSizing: "border-box",
                display: "block",
                width: "100%",
                cursor: "pointer",
                borderRadius: 1,
                "&:focus-visible": { outline: "2px solid var(--mui-palette-primary-main)", outlineOffset: 2 },
              }}
            >
              {inner}
            </Box>
          ) : (
            <Box key={r.id}>{inner}</Box>
          );
        })}
      </Stack>
    </ChartCard>
  );
}
