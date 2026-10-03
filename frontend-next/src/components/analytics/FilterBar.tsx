"use client";

import * as React from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";

export type Period = "7d" | "30d" | "6m";

export const PERIODS = [
  { value: "7d" as const, label: "7 days" },
  { value: "30d" as const, label: "30 days" },
  { value: "6m" as const, label: "6 months" },
];

/** Number of days a Period covers — keeps page code free of magic numbers. */
export const periodDays: Record<Period, number> = { "7d": 7, "30d": 30, "6m": 182 };

export interface GroupOption {
  id: string | number;
  label: string;
}

/**
 * Shared filter strip for analytics screens: a period switch plus an optional
 * multi-select group filter (class / section / custom group). Fully
 * controlled — it holds no state, so URL- or query-driven pages can own it.
 */
export function FilterBar({
  period,
  onPeriodChange,
  periods = PERIODS,
  groups,
  selectedGroups,
  onGroupsChange,
  extra,
}: {
  period: Period;
  onPeriodChange: (p: Period) => void;
  periods?: { value: Period; label: string }[];
  groups?: GroupOption[];
  selectedGroups?: GroupOption[];
  onGroupsChange?: (g: GroupOption[]) => void;
  extra?: React.ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      alignItems={{ xs: "stretch", sm: "center" }}
      sx={{ mb: 3 }}
    >
      <SegmentedButtons value={period} onChange={onPeriodChange} segments={periods} ariaLabel="Time period" />
      {groups && onGroupsChange && (
        <Autocomplete
          multiple
          size="small"
          limitTags={2}
          options={groups}
          value={selectedGroups ?? []}
          onChange={(_, v) => onGroupsChange(v)}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderTags={(value, getTagProps) =>
            value.map((o, i) => <Chip {...getTagProps({ index: i })} key={o.id} size="small" label={o.label} />)
          }
          renderInput={(p) => <TextField {...p} label="Groups" placeholder={selectedGroups?.length ? "" : "All groups"} />}
          sx={{ minWidth: 260, flex: 1, maxWidth: 480 }}
        />
      )}
      {extra}
    </Stack>
  );
}
