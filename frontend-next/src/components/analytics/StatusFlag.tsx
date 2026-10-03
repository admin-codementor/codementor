"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { CheckCircleOutlineIcon, WarningAmberIcon } from "@/components/ui/icons";
import { shape } from "@/theme/tokens";

export type Flag = "green" | "orange" | "red";
export type StudentState = "not_started" | "practising" | "stuck" | "gone_quiet";

export interface StatusInfo {
  flag: Flag;
  state: StudentState;
  reasons: string[];
}

export const STATE_LABEL: Record<StudentState, string> = {
  not_started: "Not started",
  practising: "Practising",
  stuck: "Stuck",
  gone_quiet: "Gone quiet",
};

const FLAG_STYLE: Record<Flag, { bg: string; fg: string; label: string }> = {
  green: { bg: "successContainer", fg: "onSuccessContainer", label: "On track" },
  orange: { bg: "warningContainer", fg: "onWarningContainer", label: "Worth watching" },
  red: { bg: "errorContainer", fg: "onErrorContainer", label: "Needs attention" },
};

/** Small inline flag chip for table rows and lists. */
export function FlagChip({ flag, reasons = [] }: { flag: Flag; reasons?: string[] }) {
  const s = FLAG_STYLE[flag];
  return (
    <Tooltip title={reasons.length ? reasons.join(" · ") : "No concerns"}>
      <Chip
        size="small"
        label={s.label}
        sx={{ height: 22, fontSize: 11, fontWeight: 600, bgcolor: s.bg, color: s.fg }}
      />
    </Tooltip>
  );
}

/**
 * Full-width status banner: the flag, the state, and every reason behind it.
 * A colour on its own is an accusation without evidence, so the reasons are
 * always shown rather than hidden behind a tooltip.
 */
export function StatusBanner({ status }: { status: StatusInfo }) {
  const s = FLAG_STYLE[status.flag];
  const ok = status.flag === "green";
  return (
    <Box
      sx={{
        p: 2.5,
        borderRadius: `${shape.large}px`,
        bgcolor: s.bg,
        color: s.fg,
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        gap: 2,
        alignItems: { xs: "flex-start", sm: "center" },
      }}
    >
      <Box aria-hidden sx={{ display: "grid", placeItems: "center", flexShrink: 0 }}>
        {ok ? <CheckCircleOutlineIcon fontSize="large" /> : <WarningAmberIcon fontSize="large" />}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle1" fontWeight={700}>{s.label}</Typography>
          <Chip
            size="small"
            label={STATE_LABEL[status.state]}
            sx={{ height: 20, fontSize: 11, bgcolor: "rgba(0,0,0,0.08)", color: "inherit" }}
          />
        </Stack>
        <Typography variant="body2" sx={{ mt: 0.5, opacity: 0.9 }}>
          {status.reasons.length
            ? status.reasons.join(" · ")
            : "Active recently and solving at a healthy rate."}
        </Typography>
      </Box>
    </Box>
  );
}
