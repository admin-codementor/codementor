"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { DataState } from "@/components/ui/DataState";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatRowSkeleton } from "@/components/ui/Skeletons";
import { CheckCircleOutlineIcon, GroupsOutlinedIcon, InsightsOutlinedIcon, TrackChangesOutlinedIcon, WarningAmberIcon } from "@/components/ui/icons";
import { ChartCard, ChartRow, KpiRow, KpiTile, TrendLines, WhatToLookAt } from "@/components/analytics";
import type { Insight } from "@/components/analytics";
import { radius } from "@/theme/tokens";
import { headRow } from "./DepartmentTables";

interface Tiles {
  students: number; problems: number; participation_pct: number; practising: number; not_started: number; stuck: number; gone_quiet: number;
  solved: number; solved_change: number | null; submissions: number; submissions_change: number | null; per_practising: number; pass_rate: number;
}
interface Mix { easy: number; medium: number; hard: number; other: number }
interface PracticeData {
  period_days: number; computed_at: number; tiles: Tiles;
  over_time: { label: string; solved: number; submissions: number }[];
  difficulty: { solved: Mix; bank: Mix };
  heatmap: number[][];
  languages: { id: number | null; name: string; submissions: number; passed: number; pass_rate: number; students: number }[];
  problems: { id: string; title: string; difficulty: string | null; tried: number; solved: number; submissions: number; pass_rate: number }[];
  topics: { name: string; problems: number; started: number; completed: number; solved_share: number; started_pct: number }[];
  batches: { name: string; students: number; practising: number; solved: number; per_student: number }[];
  insights: Insight[];
}

const PERIODS: { value: number; label: string }[] = [
  { value: 1, label: "Today" }, { value: 7, label: "Last 7 days" }, { value: 30, label: "Last 30 days" }, { value: 90, label: "Last 90 days" },
  { value: 180, label: "Last 6 months" }, { value: 365, label: "Last 12 months" }, { value: 0, label: "All time" },
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Change against the period before, as a whole percent; null when there is nothing to compare with. */
const change = (now: number, delta: number | null) => {
  if (delta == null) return null;
  const before = now - delta;
  return before > 0 ? Math.round((delta / before) * 100) : null;
};

function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <Box sx={{ overflowX: "auto" }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "40px repeat(24, minmax(14px, 1fr))", gap: "2px", minWidth: 520 }} role="img" aria-label="Submissions by weekday and hour, India time">
        {grid.map((row, d) => (
          <React.Fragment key={d}>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: "18px" }}>{DAYS[d]}</Typography>
            {row.map((v, h) => (
              <Tooltip key={h} title={`${DAYS[d]} ${String(h).padStart(2, "0")}:00 · ${v} submission${v === 1 ? "" : "s"}`} placement="top">
                <Box sx={{ height: 18, borderRadius: radius.xs, bgcolor: v === 0 ? "surfaceContainerHigh" : `color-mix(in srgb, var(--mui-palette-primary-main) ${Math.max(18, Math.round((v / max) * 100))}%, transparent)` }} />
              </Tooltip>
            ))}
          </React.Fragment>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, h) => <Typography key={h} variant="caption" color="text.secondary" sx={{ fontSize: 10, textAlign: "center" }}>{h % 6 === 0 ? h : ""}</Typography>)}
      </Box>
    </Box>
  );
}

function MixBar({ label, solved, bank }: { label: string; solved: number; bank: number }) {
  const pct = bank ? Math.round((solved / bank) * 100) : 0;
  return (
    <Box sx={{ mb: 1.5 }}>
      <Stack direction="row" justifyContent="space-between"><Typography variant="body2">{label}</Typography><Typography variant="caption" color="text.secondary">{solved} solved · {bank} in the bank</Typography></Stack>
      <Box sx={{ height: 8, borderRadius: radius.full, bgcolor: "surfaceContainerHighest", overflow: "hidden", mt: 0.5 }}>
        <Box sx={{ width: `${Math.min(100, pct)}%`, height: "100%", bgcolor: "primary.main" }} />
      </Box>
    </Box>
  );
}

function SimpleTable({ label, head, rows, empty }: { label: string; head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <Typography variant="body2" color="text.secondary">{empty}</Typography>;
  return (
    <Box sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: radius.md, overflow: "hidden" }}>
      <TableContainer sx={{ maxHeight: 360 }}>
        <Table size="small" stickyHeader aria-label={label}>
          <TableHead><TableRow sx={headRow}>{head.map((h, i) => <TableCell key={h} align={i === 0 ? "left" : "right"}>{h}</TableCell>)}</TableRow></TableHead>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i} sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                {r.map((c, j) => <TableCell key={j} align={j === 0 ? "left" : "right"}>{c}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

/** How the department practises: the period's numbers, when students work, what they solve and where topics lag. Department comes from the token. */
export function PracticeTab({ section, year, batch }: { section: string; year: string; batch: string }) {
  const [days, setDays] = React.useState(7);
  const q = useQuery<PracticeData>({
    queryKey: ["faculty", "practice", days, section, year, batch],
    queryFn: async () => (await api.get("/api/faculty/practice-analytics", { params: { days, ...(section ? { section } : {}), ...(year ? { year } : {}), ...(batch ? { batch } : {}) } })).data.data,
    staleTime: 60_000,
  });
  const d = q.data;
  const t = d?.tiles;
  const period = PERIODS.find((p) => p.value === days)?.label.toLowerCase() ?? "";

  return (
    <Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }} justifyContent="space-between" sx={{ mb: 3 }}>
        <TextField select size="small" label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))} sx={{ minWidth: 200 }}>
          {PERIODS.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
        </TextField>
        {d && <Typography variant="caption" color="text.secondary" suppressHydrationWarning>Updated {new Date(d.computed_at).toLocaleTimeString()}. Times are India time; a few minutes old at most.</Typography>}
      </Stack>
      <DataState loading={q.isLoading} fetching={q.isFetching} error={q.isError ? q.error : undefined} onRetry={() => q.refetch()} skeleton={<StatRowSkeleton />}
        empty={!!d && d.tiles.students === 0} emptyVariant="filtered" emptyTitle="No students in this view" emptyDescription="Clear the section, year or batch filter.">
        {d && t && (
          <>
            <WhatToLookAt insights={d.insights} />
            <KpiRow min={170}>
              <KpiTile icon={<GroupsOutlinedIcon />} label="Practising" value={t.practising} total={t.students} help={`Students who submitted something ${period}. ${t.participation_pct}% of this view.`} />
              <KpiTile icon={<CheckCircleOutlineIcon />} label="Problems solved" value={t.solved} accent="success" delta={change(t.solved, t.solved_change)} help="A problem counts once per student, on the day it was first accepted." />
              <KpiTile icon={<InsightsOutlinedIcon />} label="Submissions" value={t.submissions} accent="tertiary" delta={change(t.submissions, t.submissions_change)} help={`${t.per_practising} per student who practised`} />
              <KpiTile icon={<TrackChangesOutlinedIcon />} label="Pass rate" value={t.pass_rate} suffix="%" accent="secondary" help="Share of submissions that were accepted" />
              <KpiTile icon={<WarningAmberIcon />} label="Not started" value={t.not_started} total={t.students} accent="error" invertDelta help={`${t.stuck} stuck · ${t.gone_quiet} gone quiet. The same words as the Overview.`} />
            </KpiRow>

            <ChartRow cols={2}>
              <ChartCard title="Practice over time" subtitle={`Problems solved and submissions, ${period}`} height={280} empty={d.over_time.every((b) => b.submissions === 0)} emptyTitle="No submissions in this period">
                <TrendLines height={280} series={[
                  { id: "Submissions", data: d.over_time.map((b) => ({ x: b.label, y: b.submissions })) },
                  { id: "Solved", data: d.over_time.map((b) => ({ x: b.label, y: b.solved })) },
                ]} />
              </ChartCard>
              <ChartCard title="Solved by difficulty" subtitle="Against the problems that exist" height={280}>
                <Box sx={{ pt: 1 }}>
                  <MixBar label="Easy" solved={d.difficulty.solved.easy} bank={d.difficulty.bank.easy} />
                  <MixBar label="Medium" solved={d.difficulty.solved.medium} bank={d.difficulty.bank.medium} />
                  <MixBar label="Hard" solved={d.difficulty.solved.hard} bank={d.difficulty.bank.hard} />
                  {d.difficulty.bank.other > 0 && <MixBar label="Not graded" solved={d.difficulty.solved.other} bank={d.difficulty.bank.other} />}
                </Box>
              </ChartCard>
            </ChartRow>

            <Stack spacing={3}>
              <SectionCard title="When students practise">
                <Heatmap grid={d.heatmap} />
              </SectionCard>
              <SectionCard title="Topic coverage">
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>Over all time. “Solved” is how much of the topic students who started it have solved.</Typography>
                <SimpleTable label="Topic coverage" head={["Topic", "Problems", "Started", "Finished", "Solved"]} empty="No topics yet: problems have no tags."
                  rows={d.topics.map((x) => [x.name, x.problems, `${x.started} (${x.started_pct}%)`, x.completed, `${x.solved_share}%`])} />
              </SectionCard>
              <SectionCard title="Problems">
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>The 50 most tried {period}.</Typography>
                <SimpleTable label="Problems" head={["Problem", "Tried", "Solved", "Submissions", "Pass rate"]} empty="No problem was tried in this period."
                  rows={d.problems.map((p) => [<span key={p.id}>{p.title}{p.difficulty ? <Typography component="span" variant="caption" color="text.secondary"> · {p.difficulty}</Typography> : null}</span>, p.tried, p.solved, p.submissions, `${p.pass_rate}%`])} />
              </SectionCard>
              <ChartRow cols={2}>
                <SectionCard title="Languages">
                  <SimpleTable label="Languages" head={["Language", "Students", "Submissions", "Pass rate"]} empty="No submissions in this period."
                    rows={d.languages.map((l) => [l.name, l.students, l.submissions, `${l.pass_rate}%`])} />
                </SectionCard>
                <SectionCard title="By batch">
                  <SimpleTable label="By batch" head={["Batch", "Students", "Practising", "Solved", "Per student"]} empty="No batches."
                    rows={d.batches.map((b) => [b.name, b.students, b.practising, b.solved, b.per_student])} />
                </SectionCard>
              </ChartRow>
            </Stack>
          </>
        )}
      </DataState>
    </Stack>
  );
}
