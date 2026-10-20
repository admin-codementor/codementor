"use client";

import * as React from "react";
import NextLink from "next/link";
import { useParams, useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import {
  CheckCircleOutlineIcon, ChevronRightIcon, GroupsOutlinedIcon, InsightsOutlinedIcon, PolicyOutlinedIcon, SchoolOutlinedIcon, TimerOutlinedIcon, TrackChangesOutlinedIcon,
} from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/States";
import { ChartCard, ChartRow, FilterBar, KpiRow, KpiTile, Leaderboard, StackedBars, TrendLines, WhatToLookAt, periodDays } from "@/components/analytics";
import { fmtDuration } from "@/lib/duration";
import type { GroupOption, Period } from "@/components/analytics";
import { DistributionChart } from "@/components/faculty/analytics/Panels";
import { CourseStudentsTable, type StatusFilter } from "@/components/faculty/CourseStudentsTable";
import { headRow } from "@/components/faculty/DepartmentTables";
import { getRole } from "@/lib/auth";
import { useCourseAnalyticsQuery, type CourseAnalytics } from "@/lib/queries/courseAnalytics";
import { apiErrorMessage } from "@/lib/apiError";
import { radius } from "@/theme/tokens";

/** Past ~6 weeks, daily counts in the single digits zigzag; weekly totals show the real direction. */
function bucketWeekly<T extends { date: string }>(rows: T[], sum: (slice: T[]) => Omit<T, "date">): T[] {
  const out: T[] = [];
  for (let i = 0; i < rows.length; i += 7) {
    const slice = rows.slice(i, i + 7);
    out.push({ date: slice[0].date, ...sum(slice) } as T);
  }
  return out;
}

const label = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function FlaggedDialog({ open, onClose, rows, onStudent }: {
  open: boolean; onClose: () => void; rows: CourseAnalytics["flagged"]; onStudent: (id: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="flagged-title">
      <DialogTitle id="flagged-title">Students flagged for review</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          A flag is a prompt to look closer, not proof of cheating. Based on exam proctor events and code-similarity reports across the platform.
        </Typography>
        {rows.length === 0 ? (
          <EmptyState title="Nobody flagged" description="No students in this view have proctor flags or high code similarity." />
        ) : (
          <List disablePadding>
            {rows.map((r) => (
              <ListItemButton key={r.id} onClick={() => onStudent(r.id)} sx={{ borderRadius: radius.sm }}>
                <ListItemText
                  primary={`${r.name}${r.rollNo ? ` · ${r.rollNo}` : ""}`}
                  secondary={r.reasons.join(" · ")}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}

/** Per-unit figures with real numbers: how many students finished, started, or have not touched each unit. */
function UnitsTable({ units }: { units: CourseAnalytics["units"] }) {
  return (
    <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table size="small" aria-label="Progress by unit" sx={{ minWidth: 600 }}>
          <TableHead>
            <TableRow sx={headRow}>
              <TableCell>Unit</TableCell><TableCell align="right">Problems</TableCell><TableCell align="right">Finished it</TableCell>
              <TableCell align="right">Started, not finished</TableCell><TableCell align="right">Not started</TableCell><TableCell align="right">Average solved</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {units.map((u) => (
              <TableRow key={u.id} sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                <TableCell>{u.title}</TableCell>
                <TableCell align="right">{u.problemCount}</TableCell>
                {u.empty ? (
                  <TableCell colSpan={4} align="right"><Typography variant="caption" color="text.disabled">No problems in this unit</Typography></TableCell>
                ) : (
                  <>
                    <TableCell align="right">{u.solved}</TableCell><TableCell align="right">{u.partial}</TableCell>
                    <TableCell align="right">{u.notStarted}</TableCell><TableCell align="right">{u.avgPercent}%</TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

/** How each class (year and section) is doing, side by side. */
function ByClassTable({ rows }: { rows: CourseAnalytics["byClass"] }) {
  return (
    <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table size="small" aria-label="Completion by class" sx={{ minWidth: 600 }}>
          <TableHead>
            <TableRow sx={headRow}>
              <TableCell>Class</TableCell><TableCell align="right">Students</TableCell><TableCell align="right">Completed</TableCell>
              <TableCell align="right">In progress</TableCell><TableCell align="right">Not started</TableCell>
              <TableCell align="right">Average</TableCell><TableCell align="right">Median</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.label} sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                <TableCell>{c.label}</TableCell><TableCell align="right">{c.students}</TableCell><TableCell align="right">{c.completed}</TableCell>
                <TableCell align="right">{c.inProgress}</TableCell><TableCell align="right">{c.notStarted}</TableCell>
                <TableCell align="right">{c.avgPercent}%</TableCell><TableCell align="right">{c.medianPercent}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

export default function CourseAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [period, setPeriod] = React.useState<Period>("7d");
  const [groups, setGroups] = React.useState<GroupOption[]>([]);
  const [flaggedOpen, setFlaggedOpen] = React.useState(false);
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [bucket, setBucket] = React.useState<number | null>(null);
  const studentsRef = React.useRef<HTMLDivElement | null>(null);
  const isHod = getRole() === "hod" || getRole() === "admin";

  const days = periodDays[period];
  const query = useCourseAnalyticsQuery(id, days, groups.map((g) => String(g.id)));
  const d = query.data;
  // Only the very first load shows a skeleton; later filter changes keep the old data (keepPreviousData).
  const loading = query.isLoading;

  const weekly = days > 45;
  const trendSubs = React.useMemo(() => {
    if (!d) return [];
    const rows = weekly
      ? bucketWeekly(d.daily, (s) => ({ subs: s.reduce((n, x) => n + x.subs, 0), solved: s.reduce((n, x) => n + x.solved, 0), activeUsers: Math.max(...s.map((x) => x.activeUsers)), minutes: s.reduce((n, x) => n + x.minutes, 0) }))
      : d.daily;
    return rows;
  }, [d, weekly]);

  const groupOptions: GroupOption[] = (d?.availableGroups ?? []).map((g) => ({ id: g.id, label: `${g.name} (${g.students})` }));

  return (
    <Stack>
      <Breadcrumbs separator={<ChevronRightIcon fontSize="small" sx={{ color: "text.disabled" }} />} sx={{ mb: 1.5 }}>
        <Link component={NextLink} href="/faculty/courses" underline="hover" color="text.secondary">Courses</Link>
        <Link component={NextLink} href={`/faculty/courses/${id}`} underline="hover" color="text.secondary">{d?.course.title ?? "Course"}</Link>
        <Typography variant="body2" color="text.primary" fontWeight={600}>Class analytics</Typography>
      </Breadcrumbs>

      <PageHeader
        title={d ? `${d.course.title}: class analytics` : "Class analytics"}
        subtitle={d ? `${d.totalStudents} student${d.totalStudents === 1 ? "" : "s"} in this view · ${d.course.moduleCount} unit${d.course.moduleCount === 1 ? "" : "s"}` : undefined}
      />

      {query.isError && !d ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => query.refetch()}>Retry</Button>}>
          {apiErrorMessage(query.error, "Couldn't load class analytics.")}
        </Alert>
      ) : loading ? (
        <Stack spacing={2}><Skeleton variant="rounded" height={56} /><Skeleton variant="rounded" height={110} /><Skeleton variant="rounded" height={340} /></Stack>
      ) : !d ? null : d.totalStudents === 0 && groups.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState
            icon={<GroupsOutlinedIcon />}
            title="No students to show yet"
            description={isHod ? "No active students are in this view yet. Students appear here once their accounts exist in your department." : "Analytics covers the students in your classes. Create a class, share its join code, and their progress on this course shows up here."}
            action={isHod ? undefined : <Button component={NextLink} href="/faculty/classes" variant="outlined">Go to Classes</Button>}
          />
        </Card>
      ) : (
        <>
          <FilterBar
            period={period}
            onPeriodChange={setPeriod}
            groups={groupOptions}
            selectedGroups={groupOptions.filter((o) => groups.some((g) => g.id === o.id))}
            onGroupsChange={setGroups}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
            The period changes only the activity figures and charts (active students, submissions, trends). Completion and progress count everything ever solved.
          </Typography>

          <WhatToLookAt insights={d.insights} />

          <KpiRow min={170}>
            <KpiTile
              icon={<GroupsOutlinedIcon />}
              label="Active students"
              value={d.kpis.activeUsers.value}
              total={d.kpis.activeUsers.total}
              series={d.kpis.activeUsers.series}
              help="Students who submitted to this course's problems in the selected period"
            />
            <KpiTile
              icon={<TimerOutlinedIcon />}
              label="Submissions"
              value={d.kpis.submissions.value}
              series={d.kpis.submissions.series}
              accent="secondary"
              help="Submissions to this course's problems in the selected period"
            />
            <KpiTile
              icon={<CheckCircleOutlineIcon />}
              label="Completed"
              value={d.kpis.completedUsers.value}
              total={d.kpis.completedUsers.total}
              accent="success"
              help="Solved every problem in the course (accepted at any time). Click to list them."
              onClick={() => { setBucket(null); setStatus("completed"); studentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
            />
            <KpiTile
              icon={<TrackChangesOutlinedIcon />}
              label="In progress"
              value={d.kpis.inProgressUsers.value}
              total={d.kpis.inProgressUsers.total}
              help="Tried at least one problem and not finished. Includes students who tried but have solved nothing yet. Click to list them."
              onClick={() => { setBucket(null); setStatus("in_progress"); studentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
            />
            <KpiTile
              icon={<SchoolOutlinedIcon />}
              label="Not started"
              value={d.kpis.notStartedUsers.value}
              total={d.kpis.notStartedUsers.total}
              accent="warning"
              help="Never submitted anything for this course. Click to list them."
              onClick={() => { setBucket(null); setStatus("not_started"); studentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
            />
            <KpiTile
              icon={<InsightsOutlinedIcon />}
              label="Average progress"
              value={`${d.summary.avgPercent}%`}
              accent="tertiary"
              help={`Median ${d.summary.medianPercent}%. Share of the course's ${d.summary.totalProblems} problems solved, over every student in this view.`}
            />
            <KpiTile
              icon={<TimerOutlinedIcon />}
              label="Average active time"
              value={d.time.hasData ? fmtDuration(d.kpis.avgActiveSeconds.value) : "—"}
              series={d.time.hasData ? d.kpis.avgActiveSeconds.series : undefined}
              accent="tertiary"
              help={d.time.hasData ? `Active time in this course per student who spent any, in the selected period. Counts only time with the problem open and the tab visible.` : "No time has been recorded for this course yet. Time is recorded from the day the timer was switched on."}
            />
            <KpiTile
              icon={<PolicyOutlinedIcon />}
              label="Flagged"
              value={d.kpis.suspicious.value}
              total={d.kpis.suspicious.total}
              accent="error"
              help="Proctor flags or high code similarity. Click to review who and why."
              onClick={() => setFlaggedOpen(true)}
            />
          </KpiRow>

          <ChartRow cols={1}>
            <ChartCard
              title="Unit-wise completion"
              subtitle="Each unit is a course module. Solved = every problem in it solved; Partial = started but not finished; empty units are left out."
              height={320}
              empty={d.units.length === 0}
              emptyDescription="Add modules with problems to this course to see where students get stuck."
            >
              <StackedBars
                height={320}
                rows={d.units.filter((u) => !u.empty).map((u) => ({ label: u.title, Solved: u.solved, Partial: u.partial, "Not started": u.notStarted }))}
              />
            </ChartCard>
          </ChartRow>
          {d.units.length > 0 && <Box sx={{ mb: 3 }}><UnitsTable units={d.units} /></Box>}

          <ChartRow cols={1}>
            <ChartCard
              title="How far along each student is"
              subtitle={`Share of this course's ${d.completion.totalProblems} problems each student has solved. Average ${d.summary.avgPercent}%, median ${d.summary.medianPercent}%; ${d.summary.completed} of ${d.totalStudents} finished it. The 0% bar includes students who tried but solved nothing.`}
              height={240}
              empty={d.completion.totalProblems === 0}
              emptyTitle="This course has no problems yet"
              emptyDescription="Add problems to its modules to see how far along each student is."
            >
              <DistributionChart
                histogram={d.completion.buckets}
                label="Share of the course solved (click a bar to list those students)"
                onBarClick={(b) => {
                  const i = d.completion.buckets.findIndex((x) => x.bucket === b.bucket);
                  setStatus("all");
                  setBucket(i >= 0 ? i : null);
                  studentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              />
            </ChartCard>
          </ChartRow>

          <ChartRow cols={2}>
            <ChartCard title="Submissions and solved" subtitle={weekly ? "Weekly totals" : "Per day"} height={240}>
              <TrendLines
                height={240}
                series={[
                  { id: "Submissions", data: trendSubs.map((r) => ({ x: label(r.date), y: r.subs })) },
                  { id: "Solved", data: trendSubs.map((r) => ({ x: label(r.date), y: r.solved })) },
                ]}
              />
            </ChartCard>
            <ChartCard title="Active students" subtitle={weekly ? "Busiest day in each week" : "Per day"} height={240}>
              <TrendLines
                height={240}
                colorOffset={3}
                series={[{ id: "Active students", data: trendSubs.map((r) => ({ x: label(r.date), y: r.activeUsers })) }]}
              />
            </ChartCard>
          </ChartRow>

          {d.time.hasData && (
            <ChartRow cols={2}>
              <ChartCard title="Learning time per day" subtitle={weekly ? "Weekly totals, in minutes" : "Minutes of active time in this course, all students together"} height={240}>
                <TrendLines
                  height={240}
                  colorOffset={2}
                  series={[{ id: "Minutes", data: (weekly ? bucketWeekly(d.daily, (s) => ({ minutes: s.reduce((n, x) => n + x.minutes, 0), subs: 0, solved: 0, activeUsers: 0 })) : d.daily).map((r) => ({ x: label(r.date), y: r.minutes })) }]}
                />
              </ChartCard>
              <ChartCard title="Learning time by weekday" subtitle="Minutes in the selected period, all students together" height={240}>
                <DistributionChart
                  histogram={["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => ({ bucket: day, from: i, count: d.time.weekdayMinutes[i] }))}
                  label="Minutes of active time"
                />
              </ChartCard>
            </ChartRow>
          )}

          <ChartRow cols={2}>
            <Leaderboard
              title="Most active students"
              subtitle="Days with at least one submission"
              unit=" days"
              rows={d.mostActiveUsers.map((u) => ({ id: u.id, label: u.name, hint: u.rollNo ?? undefined, value: u.activeDays }))}
              onRowClick={(r) => router.push(`/faculty/students/${r.id}`)}
              emptyDescription="Students who submit to this course in the selected period appear here."
            />
            <Leaderboard
              title="Most active classes"
              subtitle="Submissions by the class's students"
              unit=" subs"
              rows={d.mostActiveGroups.map((g) => ({ id: g.id, label: g.name, hint: `${g.activeStudents}/${g.students} active`, value: g.subs }))}
              emptyDescription="Classes appear once students have joined."
            />
          </ChartRow>

          {d.byClass.length > 1 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Completion by class</Typography>
              <ByClassTable rows={d.byClass} />
            </Box>
          )}

          <Box ref={studentsRef} sx={{ mb: 3, scrollMarginTop: 80 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Students</Typography>
            <CourseStudentsTable
              rows={d.students} status={status} onStatus={(v) => { setBucket(null); setStatus(v); }}
              bucket={bucket} onBucket={setBucket} courseTitle={d.course.title}
              bucketLabel={bucket == null ? null : (d.completion.buckets[bucket]?.bucket ?? null)}
              days={days}
            />
          </Box>

          <Typography variant="caption" color="text.secondary" component="p" sx={{ maxWidth: 760 }}>
            How these figures are counted: a problem is <strong>solved</strong> once a submission to it was accepted, at any time. A course
            counts only problems that still exist and are published, each once even if it appears in two units
            {d.course.skippedProblems.deleted + d.course.skippedProblems.draft > 0
              ? ` (${d.course.skippedProblems.deleted} deleted and ${d.course.skippedProblems.draft} draft problem${d.course.skippedProblems.deleted + d.course.skippedProblems.draft === 1 ? "" : "s"} are left out here)`
              : ""}.
            A student is <strong>completed</strong> with every problem solved, <strong>not started</strong> with no submission at all, and
            otherwise <strong>in progress</strong>. Graduated students are not counted.
          </Typography>

          <FlaggedDialog
            open={flaggedOpen}
            onClose={() => setFlaggedOpen(false)}
            rows={d.flagged}
            onStudent={(sid) => router.push(`/faculty/students/${sid}`)}
          />
        </>
      )}
    </Stack>
  );
}
