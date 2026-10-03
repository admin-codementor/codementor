"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/States";
import {
  AssignmentOutlinedIcon, ChevronLeftIcon, ChevronRightIcon, ExpandLessIcon, ExpandMoreIcon, MenuBookOutlinedIcon,
  TrendingDownIcon, TrendingUpIcon,
} from "@/components/ui/icons";

export interface WeeklyRow {
  week_start: string;
  week_end: string;
  subs: number;
  accepted: number;
  solved: number;
  active_days: number;
  solved_change: number | null;
  subs_change: number | null;
}

export interface ExamRow {
  id: string;
  title: string;
  submitted: boolean;
  score: number | null;
  total: number | null;
  minutes_taken: number | null;
  submitted_at: string | null;
}

export interface CourseUnit { id: string; title: string; total: number; solved: number; attempted: number }
export interface CourseRow {
  id: string; title: string; total: number; solved: number; percent: number;
  pending_units: number; units: CourseUnit[];
}

const fmtWeek = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function Delta({ value, unit }: { value: number | null; unit: string }) {
  if (value == null) return <Typography variant="caption" color="text.secondary">—</Typography>;
  if (value === 0) return <Typography variant="caption" color="text.secondary">no change</Typography>;
  const up = value > 0;
  return (
    <Stack direction="row" spacing={0.25} alignItems="center" sx={{ color: up ? "success.main" : "error.main" }}>
      {up ? <TrendingUpIcon sx={{ fontSize: 15 }} /> : <TrendingDownIcon sx={{ fontSize: 15 }} />}
      <Typography variant="caption" fontWeight={600}>{up ? "+" : ""}{value} {unit}</Typography>
    </Stack>
  );
}

/**
 * Week-by-week review strip with a week picker. The HOD review showed this is
 * the loop staff actually run: "what changed since last week", not a lifetime
 * total. The selected week is shown against the week before it.
 */
export function WeeklyProgressCard({ weeks }: { weeks: WeeklyRow[] }) {
  // Default to the most recent week.
  const [index, setIndex] = React.useState(Math.max(0, weeks.length - 1));
  const row = weeks[index];

  if (!weeks.length || !row) {
    return (
      <SectionCard title="Weekly progress">
        <EmptyState title="No activity yet" description="Once this student submits, their week-by-week progress appears here." />
      </SectionCard>
    );
  }

  const metrics = [
    { label: "Problems solved", value: row.solved, change: row.solved_change, unit: "" },
    { label: "Submissions", value: row.subs, change: row.subs_change, unit: "" },
    { label: "Accepted", value: row.accepted, change: null, unit: "" },
    { label: "Active days", value: `${row.active_days} / 7`, change: null, unit: "" },
  ];

  return (
    <SectionCard
      title="Weekly progress"
      action={
        <Stack direction="row" spacing={0.5} alignItems="center">
          <IconButton size="small" aria-label="Previous week" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
          <Typography variant="caption" sx={{ minWidth: 130, textAlign: "center" }}>
            {fmtWeek(row.week_start)} – {fmtWeek(row.week_end)}
          </Typography>
          <IconButton size="small" aria-label="Next week" disabled={index >= weeks.length - 1} onClick={() => setIndex((i) => i + 1)}>
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Stack>
      }
    >
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" }, gap: 2 }}>
        {metrics.map((m) => (
          <Box key={m.label}>
            <Typography variant="overline" color="text.secondary">{m.label}</Typography>
            <Typography variant="h5" fontWeight={600} sx={{ lineHeight: 1.2 }}>{m.value}</Typography>
            <Delta value={m.change} unit={m.unit} />
          </Box>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
        Change is against the previous 7 days. A problem counts in the week it was first solved.
      </Typography>
    </SectionCard>
  );
}

/** Exams this student has attempted, with score and the time they actually took. */
export function ExamHistoryCard({ exams, summary }: {
  exams: ExamRow[];
  summary: { taken: number; available: number; avg_percent: number | null };
}) {
  return (
    <SectionCard
      title="Exams"
      icon={<AssignmentOutlinedIcon fontSize="small" />}
      action={
        <Typography variant="caption" color="text.secondary">
          {summary.taken} of {summary.available} taken
          {summary.avg_percent != null ? ` · avg ${summary.avg_percent}%` : ""}
        </Typography>
      }
    >
      {exams.length === 0 ? (
        <EmptyState
          title="No exam attempts"
          description="When this student sits a published exam, the score and time taken show up here."
        />
      ) : (
        <Stack spacing={1.5}>
          {exams.map((e) => {
            const pct = e.submitted && e.total ? Math.round(((e.score ?? 0) / e.total) * 100) : null;
            return (
              <Stack
                key={e.id}
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                spacing={2}
                sx={{ p: 1.5, borderRadius: 2, border: "1px solid", borderColor: "outlineVariant" }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={500} noWrap>{e.title}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {e.submitted
                      ? `Submitted${e.minutes_taken != null ? ` · took ${e.minutes_taken} min` : ""}`
                      : "Started, not submitted"}
                  </Typography>
                </Box>
                {pct != null ? (
                  <Chip
                    size="small"
                    label={`${e.score}/${e.total} · ${pct}%`}
                    sx={{
                      fontWeight: 600,
                      bgcolor: pct >= 60 ? "successContainer" : pct >= 35 ? "warningContainer" : "errorContainer",
                      color: pct >= 60 ? "onSuccessContainer" : pct >= 35 ? "onWarningContainer" : "onErrorContainer",
                    }}
                  />
                ) : (
                  <Chip size="small" label="In progress" sx={{ bgcolor: "surfaceContainerHigh", color: "onSurfaceVariant" }} />
                )}
              </Stack>
            );
          })}
        </Stack>
      )}
    </SectionCard>
  );
}

/** Course completion with a per-unit breakdown — "what is still pending". */
export function CourseProgressCard({ courses }: { courses: CourseRow[] }) {
  const [open, setOpen] = React.useState<string | null>(courses[0]?.id ?? null);

  return (
    <SectionCard title="Course progress" icon={<MenuBookOutlinedIcon fontSize="small" />}>
      {courses.length === 0 ? (
        <EmptyState
          title="No published courses yet"
          description="Publish a course with problems and each student's unit-by-unit progress appears here."
        />
      ) : (
        <Stack spacing={2}>
          {courses.map((c) => {
            const expanded = open === c.id;
            return (
              <Box key={c.id}>
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1.5}
                  component="button"
                  type="button"
                  onClick={() => setOpen(expanded ? null : c.id)}
                  aria-expanded={expanded}
                  sx={{
                    all: "unset", display: "flex", width: "100%", cursor: "pointer", borderRadius: 1,
                    "&:focus-visible": { outline: "2px solid var(--mui-palette-primary-main)", outlineOffset: 2 },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                      <Typography variant="body2" fontWeight={500} noWrap>{c.title}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 2, flexShrink: 0 }}>
                        {c.solved}/{c.total} · {c.percent}%
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={c.percent}
                      color={c.percent >= 80 ? "success" : c.percent >= 40 ? "primary" : "warning"}
                      sx={{ height: 8, borderRadius: 4 }}
                      aria-label={`${c.title}: ${c.percent}% complete`}
                    />
                    {c.pending_units > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        {c.pending_units} unit{c.pending_units === 1 ? "" : "s"} still pending
                      </Typography>
                    )}
                  </Box>
                  {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </Stack>
                <Collapse in={expanded}>
                  <Stack spacing={1} sx={{ mt: 1.5, pl: 1.5, borderLeft: "2px solid", borderColor: "outlineVariant" }}>
                    {c.units.map((u) => (
                      <Stack key={u.id} direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
                        <Typography variant="caption" sx={{ minWidth: 0 }} noWrap>{u.title}</Typography>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                          <Box sx={{ width: 72, height: 6, borderRadius: 3, bgcolor: "surfaceContainerHighest", overflow: "hidden" }}>
                            <Box sx={{ width: `${u.total ? (u.solved / u.total) * 100 : 0}%`, height: "100%", bgcolor: "success.main" }} />
                          </Box>
                          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 44, textAlign: "right" }}>
                            {u.solved}/{u.total}
                          </Typography>
                        </Stack>
                      </Stack>
                    ))}
                  </Stack>
                </Collapse>
              </Box>
            );
          })}
        </Stack>
      )}
    </SectionCard>
  );
}
