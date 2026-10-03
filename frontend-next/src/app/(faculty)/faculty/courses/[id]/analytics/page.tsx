"use client";

import * as React from "react";
import NextLink from "next/link";
import { useParams, useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
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
import Typography from "@mui/material/Typography";
import {
  CheckCircleOutlineIcon, ChevronRightIcon, GroupsOutlinedIcon, PolicyOutlinedIcon, SchoolOutlinedIcon, TimerOutlinedIcon,
} from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/States";
import { ChartCard, ChartRow, FilterBar, KpiRow, KpiTile, Leaderboard, StackedBars, TrendLines, periodDays } from "@/components/analytics";
import type { GroupOption, Period } from "@/components/analytics";
import { useCourseAnalyticsQuery, type CourseAnalytics } from "@/lib/queries/courseAnalytics";
import { apiErrorMessage } from "@/lib/apiError";

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
              <ListItemButton key={r.id} onClick={() => onStudent(r.id)} sx={{ borderRadius: 1 }}>
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

export default function CourseAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [period, setPeriod] = React.useState<Period>("7d");
  const [groups, setGroups] = React.useState<GroupOption[]>([]);
  const [flaggedOpen, setFlaggedOpen] = React.useState(false);

  const days = periodDays[period];
  const query = useCourseAnalyticsQuery(id, days, groups.map((g) => String(g.id)));
  const d = query.data;
  // Only the very first load shows a skeleton; later filter changes keep the old data (keepPreviousData).
  const loading = query.isLoading;

  const weekly = days > 45;
  const trendSubs = React.useMemo(() => {
    if (!d) return [];
    const rows = weekly
      ? bucketWeekly(d.daily, (s) => ({ subs: s.reduce((n, x) => n + x.subs, 0), solved: s.reduce((n, x) => n + x.solved, 0), activeUsers: Math.max(...s.map((x) => x.activeUsers)) }))
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
            description="Analytics covers the students in your classes. Create a class, share its join code, and their progress on this course shows up here."
            action={<Button component={NextLink} href="/faculty/classes" variant="outlined">Go to Classes</Button>}
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
              help="Students who have solved every problem in the course"
            />
            <KpiTile
              icon={<SchoolOutlinedIcon />}
              label="Not started"
              value={d.kpis.notStartedUsers.value}
              total={d.kpis.notStartedUsers.total}
              accent="warning"
              help="Students with no attempt on any problem in the course"
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
              subtitle="Each unit is a course module. Solved = every problem in it solved; Partial = started."
              height={320}
              empty={d.units.length === 0}
              emptyDescription="Add modules with problems to this course to see where students get stuck."
            >
              <StackedBars
                height={320}
                rows={d.units.map((u) => ({ label: u.title, Solved: u.solved, Partial: u.partial, "Not started": u.notStarted }))}
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

          <ChartRow cols={2}>
            <Leaderboard
              title="Most active students"
              subtitle="Days with at least one submission. Time on platform isn't tracked yet."
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
