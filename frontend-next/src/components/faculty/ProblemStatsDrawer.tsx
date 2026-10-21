"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import { ExportButton, KpiTile, toCsv } from "@/components/analytics";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SearchField } from "@/components/ui/SearchField";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { SendIcon, CloseIcon, GroupsOutlinedIcon, CheckCircleOutlineIcon, TimerOutlinedIcon, WarningAmberIcon, TrackChangesOutlinedIcon } from "@/components/ui/icons";
import { useProblemStatisticsQuery, type ProblemPerformer, type ProblemStudentRow, type ProblemStudentStatus } from "@/lib/queries/problemStatistics";
import { fmtDuration } from "@/lib/duration";
import { radius, typeScale } from "@/theme/tokens";
import { RemindDialog } from "./RemindDialog";
import { Head, Pager, bodyRow, headRow, useTable } from "./DepartmentTables";

type StatusFilter = "all" | ProblemStudentStatus | "flagged";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "in_progress", label: "In progress" },
  { value: "not_started", label: "Not started" },
  { value: "completed", label: "Completed" },
  { value: "flagged", label: "Flagged" },
];
const STATUS_LABEL: Record<ProblemStudentStatus, string> = { completed: "Completed", in_progress: "In progress", not_started: "Not started" };

const SORT = {
  name: (r: ProblemStudentRow) => r.name,
  status: (r: ProblemStudentRow) => ({ in_progress: 0, not_started: 1, completed: 2 }[r.status]),
  subs: (r: ProblemStudentRow) => r.submissions,
  compile: (r: ProblemStudentRow) => r.compileErrors,
  runtime: (r: ProblemStudentRow) => r.runtimeErrors + r.timeouts,
  wrong: (r: ProblemStudentRow) => r.wrongAnswers,
  time: (r: ProblemStudentRow) => r.timeSeconds,
  flags: (r: ProblemStudentRow) => r.flagEvents,
};
type SortKey = keyof typeof SORT;
const searchText = (r: ProblemStudentRow) => `${r.name} ${r.rollNo ?? ""} ${r.section ?? ""}`;

function Performer({ title, p, empty }: { title: string; p: ProblemPerformer | null; empty: string }) {
  const done = p?.status === "completed";
  return (
    <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: 2, flex: 1, minWidth: 220, borderLeft: "4px solid", borderLeftColor: title === "Best" ? "success.main" : "warning.main" }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</Typography>
      {p ? (
        <>
          <Typography variant="subtitle1" fontWeight={600} noWrap>{p.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {p.rollNo ? `${p.rollNo} · ` : ""}
            {done ? `solved in ${fmtDuration(p.solvedAtSeconds ?? p.timeSeconds)}` : `${p.submissions} submissions, ${fmtDuration(p.timeSeconds)} spent`}
          </Typography>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{empty}</Typography>
      )}
    </Card>
  );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center">
      <Typography variant="body2" sx={{ width: 150, flexShrink: 0 }}>{label}</Typography>
      <LinearProgress
        variant="determinate" value={max > 0 ? (value / max) * 100 : 0} aria-label={`${label}: ${value}`}
        sx={{ flex: 1, height: 8, borderRadius: radius.xs, "& .MuiLinearProgress-bar": { bgcolor: color } }}
      />
      <Typography variant="body2" sx={{ width: 36, textAlign: "right", fontFamily: "ui-monospace, monospace" }}>{value}</Typography>
    </Stack>
  );
}

/**
 * Everything faculty ask about one question: how many finished or are stuck, how long it takes, what kind of mistakes
 * (compile, run, time limit, wrong answer), who did best and worst, who looks suspicious, and one row per student.
 */
export function ProblemStatsDrawer({ problemId, title, onClose }: { problemId: string | null; title?: string; onClose: () => void }) {
  const router = useRouter();
  const [groups, setGroups] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [remindOpen, setRemindOpen] = React.useState(false);
  const { data, isLoading, isError, refetch, isFetching } = useProblemStatisticsQuery(problemId, groups);

  const rows = React.useMemo(
    () => (data?.students ?? []).filter((r) => (status === "all" ? true : status === "flagged" ? r.suspicious : r.status === status)),
    [data, status],
  );
  const t = useTable<ProblemStudentRow, SortKey>(rows, searchText, SORT, { by: "status", dir: "asc" });

  // Everyone shown who has not finished the question: the people a reminder is for.
  const toRemind = t.all.filter((r) => r.status !== "completed").map((r) => r.id);

  const csv = () => toCsv(t.all.map((r) => ({
    name: r.name, roll_no: r.rollNo ?? "", status: STATUS_LABEL[r.status], submissions: r.submissions,
    attempts_to_solve: r.attemptsToSolve ?? "", compile_errors: r.compileErrors, runtime_errors: r.runtimeErrors,
    time_limit_hits: r.timeouts, wrong_answers: r.wrongAnswers, time_spent_seconds: r.timeSeconds,
    time_to_solve_seconds: r.solvedAtSeconds ?? "", flag_events: r.flagEvents,
  })));

  const f = data?.failures;
  const failMax = f ? Math.max(1, f.compile, f.runtime, f.timeout, f.wrong, f.other) : 1;
  const histMax = data ? Math.max(1, ...data.timeHistogram.map((b) => b.count)) : 1;

  return (
    <Drawer anchor="right" open={!!problemId} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: "100%", md: 820 }, maxWidth: "100%", bgcolor: "background.default" } } }}>
      <Box sx={{ p: { xs: 2, sm: 3 }, overflow: "auto" }}>
        <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Question statistics</Typography>
            <Typography variant="h6" fontWeight={700} noWrap>{data?.problem.title ?? title ?? "Loading…"}</Typography>
          </Box>
          <IconButton onClick={onClose} aria-label="Close statistics"><CloseIcon /></IconButton>
        </Stack>

        {isError ? (
          <ErrorState title="Couldn't load the statistics" onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <Stack spacing={2}>
            <Skeleton variant="rounded" height={90} />
            <Skeleton variant="rounded" height={160} />
            <Skeleton variant="rounded" height={260} />
          </Stack>
        ) : (
          <Stack spacing={2.5} sx={{ opacity: isFetching ? 0.7 : 1, transition: "opacity 120ms" }}>
            {data.availableGroups.length > 1 && (
              <TextField
                select size="small" label="Classes" value={groups}
                onChange={(e) => setGroups(typeof e.target.value === "string" ? e.target.value.split(",") : (e.target.value as string[]))}
                slotProps={{ select: { multiple: true, renderValue: (sel) => ((sel as string[]).length ? `${(sel as string[]).length} selected` : "All my students") } }}
                sx={{ maxWidth: 320 }}
              >
                {data.availableGroups.map((g) => <MenuItem key={g.id} value={g.id}>{g.name} ({g.students})</MenuItem>)}
              </TextField>
            )}

            {data.totals.students === 0 ? (
              <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
                <EmptyState compact icon={<GroupsOutlinedIcon />} title="No students to show" description="This question's statistics cover your own classes' students. Add students to a class first." />
              </Card>
            ) : (
              <>
                <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)" } }}>
                  <KpiTile icon={<GroupsOutlinedIcon />} label="Students" value={data.totals.students} />
                  <KpiTile icon={<CheckCircleOutlineIcon />} label="Completed" value={data.totals.completed} total={data.totals.students} accent="success" />
                  <KpiTile icon={<TrackChangesOutlinedIcon />} label="In progress" value={data.totals.inProgress} total={data.totals.students} accent="warning" />
                  <KpiTile icon={<GroupsOutlinedIcon />} label="Not started" value={data.totals.notStarted} total={data.totals.students} accent="secondary" />
                  <KpiTile icon={<TimerOutlinedIcon />} label="Average time spent" value={fmtDuration(data.avgTimeSeconds)} help="Active time on the problem page, over students who spent any." />
                  <KpiTile icon={<TimerOutlinedIcon />} label="Average time to solve" value={fmtDuration(data.avgSolveSeconds)} help={data.avgAttemptsToSolve != null ? `${data.avgAttemptsToSolve} submissions to get it accepted, on average.` : undefined} accent="tertiary" />
                </Box>
                {!data.hasTimeData && (
                  <Typography variant="caption" color="text.secondary">
                    No time has been recorded for this question yet. Time is recorded from the day the timer was switched on, so earlier work shows no time.
                  </Typography>
                )}

                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <Performer title="Best" p={data.best} empty="Nobody has solved it yet." />
                  <Performer title="Weakest" p={data.weakest} empty="Nobody has tried it yet." />
                </Stack>

                <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                  <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: 2 }}>
                    <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>What goes wrong</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>Every failed submission, by kind.</Typography>
                    <Stack spacing={1}>
                      <BarRow label="Compile errors" value={f!.compile} max={failMax} color="var(--mui-palette-error-main)" />
                      <BarRow label="Runtime errors" value={f!.runtime} max={failMax} color="var(--mui-palette-error-main)" />
                      <BarRow label="Time limit hit" value={f!.timeout} max={failMax} color="var(--mui-palette-warning-main)" />
                      <BarRow label="Wrong answer" value={f!.wrong} max={failMax} color="var(--mui-palette-warning-main)" />
                      {f!.other > 0 && <BarRow label="Other" value={f!.other} max={failMax} color="var(--mui-palette-outline)" />}
                    </Stack>
                  </Card>
                  <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: 2 }}>
                    <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>Time spent</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>Students by how long they spent on this question.</Typography>
                    <Stack spacing={1}>
                      {data.timeHistogram.map((b) => <BarRow key={b.label} label={b.label} value={b.count} max={histMax} color="var(--mui-palette-primary-main)" />)}
                    </Stack>
                  </Card>
                </Box>

                {data.flagged.length > 0 && (
                  <Card variant="outlined" sx={{ borderColor: "warning.main", p: 2 }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <WarningAmberIcon fontSize="small" color="warning" />
                      <Typography variant="subtitle2" fontWeight={600}>{data.flagged.length} flagged on this question</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                      Three or more flag events on this question, mostly blocked paste attempts. A flag is a reason to look, not proof.
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                      {data.flagged.map((s) => (
                        <Chip key={s.id} size="small" label={`${s.name} · ${s.flagEvents}`} onClick={() => router.push(`/faculty/students/${s.id}`)} />
                      ))}
                    </Stack>
                  </Card>
                )}

                <Box>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }} sx={{ mb: 1.5 }}>
                    <SegmentedButtons<StatusFilter> value={status} onChange={setStatus} ariaLabel="Filter students" segments={FILTERS} />
                    <Box sx={{ flex: 1 }} />
                    <SearchField value={t.q} onChange={t.setQ} placeholder="Name or roll no" label="Search students" sx={{ maxWidth: 240 }} />
                    <Button size="small" variant="outlined" startIcon={<SendIcon />} disabled={toRemind.length === 0} onClick={() => setRemindOpen(true)}>Remind {toRemind.length}</Button>
                    <ExportButton filename={`${(data.problem.title || "question").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-statistics.csv`} csv={csv} disabled={t.all.length === 0} />
                  </Stack>
                  <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
                    {t.all.length === 0 ? (
                      <EmptyState compact icon={<GroupsOutlinedIcon />} title="No students match" description="Try a different filter or clear the search." />
                    ) : (
                      <>
                        <TableContainer sx={{ overflowX: "auto" }}>
                          <Table size="small" aria-label="Students and how they did on this question" sx={{ minWidth: 720 }}>
                            <TableHead>
                              <TableRow sx={headRow}>
                                <Head<SortKey> id="name" label="Student" sort={t.sort} toggle={t.toggle} />
                                <Head<SortKey> id="status" label="Status" sort={t.sort} toggle={t.toggle} />
                                <Head<SortKey> id="subs" label="Submissions" sort={t.sort} toggle={t.toggle} align="right" />
                                <Head<SortKey> id="compile" label="Compile" sort={t.sort} toggle={t.toggle} align="right" />
                                <Head<SortKey> id="runtime" label="Run / time" sort={t.sort} toggle={t.toggle} align="right" />
                                <Head<SortKey> id="wrong" label="Wrong" sort={t.sort} toggle={t.toggle} align="right" />
                                <Head<SortKey> id="time" label="Time spent" sort={t.sort} toggle={t.toggle} align="right" />
                                <Head<SortKey> id="flags" label="Flags" sort={t.sort} toggle={t.toggle} align="right" />
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {t.visible.map((r) => (
                                <TableRow key={r.id} hover sx={bodyRow} onClick={() => router.push(`/faculty/students/${r.id}`)}>
                                  <TableCell>
                                    <Typography variant="body2" fontWeight={500}>{r.name}</Typography>
                                    {r.rollNo && <Typography variant="caption" color="text.secondary">{r.rollNo}</Typography>}
                                  </TableCell>
                                  <TableCell>
                                    <Chip
                                      size="small" label={STATUS_LABEL[r.status]}
                                      sx={{
                                        height: 20, fontSize: typeScale.labelSmall.fontSize, fontWeight: 600,
                                        bgcolor: r.status === "completed" ? "successContainer" : r.status === "in_progress" ? "warningContainer" : "surfaceContainerHighest",
                                        color: r.status === "completed" ? "onSuccessContainer" : r.status === "in_progress" ? "onWarningContainer" : "text.secondary",
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell align="right">{r.submissions}</TableCell>
                                  <TableCell align="right">{r.compileErrors}</TableCell>
                                  <TableCell align="right">{r.runtimeErrors + r.timeouts}</TableCell>
                                  <TableCell align="right">{r.wrongAnswers}</TableCell>
                                  <TableCell align="right">{r.timeSeconds ? fmtDuration(r.timeSeconds) : "—"}</TableCell>
                                  <TableCell align="right" sx={{ color: r.suspicious ? "warning.main" : undefined, fontWeight: r.suspicious ? 700 : 400 }}>{r.flagEvents || "—"}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                        <Pager count={t.all.length} page={t.page} onPage={t.setPage} />
                      </>
                    )}
                  </Card>
                </Box>
              </>
            )}
          </Stack>
        )}
      </Box>
      <RemindDialog open={remindOpen} onClose={() => setRemindOpen(false)} studentIds={toRemind} defaultMessage={`Please attempt "${data?.problem.title ?? title ?? "the question"}".`} what="Everyone shown here who has not completed this question gets a reminder." />
    </Drawer>
  );
}
