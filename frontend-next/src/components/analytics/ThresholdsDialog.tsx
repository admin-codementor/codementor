"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { InfoOutlinedIcon } from "@/components/ui/icons";

/**
 * The exact numbers behind the flag/state rules — mirrors
 * backend/src/utils/studentState.js exactly. These are fixed platform rules,
 * not per-college settings (unlike CampusTrack's configurable thresholds), so
 * a client-side constant is the honest source here, not a stand-in for an API.
 */
export const QUIET_DAYS = 7;
export const LOW_ACCURACY_PCT = 30;
export const MIN_SUBS_FOR_ACCURACY = 5;

/** Mirrors backend/src/utils/departmentAnalytics.js's BADGES ladder exactly. */
export const BADGES = [
  { name: "Trailblazer", minPercentile: 97 },
  { name: "Champion", minPercentile: 90 },
  { name: "Achiever", minPercentile: 80 },
  { name: "Builder", minPercentile: 60 },
  { name: "Explorer", minPercentile: 40 },
  { name: "Learner", minPercentile: 20 },
  { name: "Foundation", minPercentile: 0 },
];

function FlagExplainer() {
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>The four states</Typography>
        <Stack spacing={1}>
          <Typography variant="body2"><strong>Not started</strong> — has never submitted anything at all.</Typography>
          <Typography variant="body2"><strong>Stuck</strong> — submitting recently, but nothing has been accepted yet.</Typography>
          <Typography variant="body2">
            <strong>Gone quiet</strong> — has submitted before, but nothing in the last {QUIET_DAYS} days.
          </Typography>
          <Typography variant="body2"><strong>Practising</strong> — submitted recently and is solving things.</Typography>
        </Stack>
      </Box>
      <Box>
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>The flag colour</Typography>
        <Stack spacing={1}>
          <Typography variant="body2"><strong>Red</strong> — never started, or stuck, or two or more concerns at once.</Typography>
          <Typography variant="body2"><strong>Orange</strong> — exactly one concern worth watching.</Typography>
          <Typography variant="body2"><strong>Green</strong> — active and solving at a healthy rate.</Typography>
        </Stack>
        <Typography variant="body2" sx={{ mt: 1 }}>
          Accuracy only counts as a concern once a student has {MIN_SUBS_FOR_ACCURACY}+ submissions (too few to
          mean anything before that), and only below {LOW_ACCURACY_PCT}%.
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary">
        These are fixed platform rules applied the same way everywhere, not a setting that varies by cohort.
      </Typography>
    </Stack>
  );
}

function BadgeExplainer() {
  return (
    <Stack spacing={2}>
      <Stack spacing={1}>
        {BADGES.map((b) => (
          <Stack key={b.name} direction="row" justifyContent="space-between">
            <Typography variant="body2" fontWeight={600}>{b.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              {b.minPercentile === 0 ? "everyone else" : `top ${100 - b.minPercentile}%`}
            </Typography>
          </Stack>
        ))}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Percentile is each student&apos;s share of the current view scoring strictly below them on problems
        solved, so it moves as the cohort (or filters) change — it is not an absolute score.
      </Typography>
    </Stack>
  );
}

/**
 * Info button + dialog explaining exactly how a flag or badge was decided,
 * next to wherever one is shown. Reasons are already shown inline everywhere
 * a flag appears (never a bare colour) — this is for the rule itself, which
 * nothing else states in full.
 */
export function ThresholdsDialog({ kind, inherit = false }: { kind: "flag" | "badge"; inherit?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const title = kind === "flag" ? "How flags are calculated" : "How badges are calculated";
  return (
    <>
      <Tooltip title={title}>
        <IconButton size="small" aria-label={title} onClick={() => setOpen(true)} sx={inherit ? { color: "inherit" } : undefined}>
          <InfoOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs" aria-labelledby="thresholds-title">
        <DialogTitle id="thresholds-title">{title}</DialogTitle>
        <DialogContent dividers>
          {kind === "flag" ? <FlagExplainer /> : <BadgeExplainer />}
        </DialogContent>
        <DialogActions><Button onClick={() => setOpen(false)}>Close</Button></DialogActions>
      </Dialog>
    </>
  );
}
