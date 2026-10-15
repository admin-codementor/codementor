"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/States";
import {
  ChartCard, ChartRow, ExportButton, KpiRow, KpiTile, Leaderboard, StackedBars, StudentFunnel, ThresholdsDialog, TrendLines, toCsv,
} from "@/components/analytics";
import type { FunnelBucket } from "@/components/analytics";
import { RankingsTable, WeeklyProgressTable, type DeptStudent } from "@/components/faculty/DepartmentTables";
import { DepartmentLeaderboard } from "@/components/faculty/DepartmentLeaderboard";
import { DepartmentActivity } from "@/components/faculty/DepartmentActivity";
import { DepartmentInsights } from "@/components/faculty/DepartmentInsights";
import { MentorsTab } from "@/components/faculty/MentorsTab";
import { PortfolioTab } from "@/components/faculty/PortfolioTab";
import { PlacementTab } from "@/components/faculty/PlacementTab";
import { AlumniTab } from "@/components/faculty/AlumniTab";
import { LabsTab } from "@/components/faculty/LabsTab";
import { radius } from "@/theme/tokens";
import {
  CheckCircleOutlineIcon, GroupsOutlinedIcon, InsightsOutlinedIcon, LocalFireDepartmentOutlinedIcon,
  TipsAndUpdatesOutlinedIcon, TrackChangesOutlinedIcon, WarningAmberIcon,
} from "@/components/ui/icons";

interface DeptData {
  totals: { students: number; active_last_7: number; submissions: number; solved: number; avg_solved: number; avg_accuracy: number };
  funnel: FunnelBucket[];
  flags: { red: number; orange: number; green: number };
  sections: { name: string; students: number; avg_solved: number; at_risk: number; at_risk_pct: number; on_track: number; on_track_pct: number }[];
  badges: { name: string; count: number }[];
  weekly: { week_start: string; week_end: string; subs: number; solved: number; active_days: number; subs_change: number | null }[];
  insights: { severity: "high" | "medium" | "low"; title: string; detail: string }[];
  students: DeptStudent[];
  scope: {
    department: string | null; section: string | null; year: string | null; sections: string[]; years: number[];
    mentor: string | null; mentors: { id: string; name: string; mentees: number }[]; unmentored: number;
  };
}

type DeptTab = "overview" | "weekly" | "rankings" | "departments" | "activity" | "mentors" | "portfolio" | "placement" | "alumni" | "labs";
type Baseline = "view" | "year" | "institution";
const BASELINES: { value: Baseline; label: string }[] = [
  { value: "view", label: "This view" },
  { value: "year", label: "Year-wise" },
  { value: "institution", label: "Whole department" },
];

const SEVERITY: Record<string, "error" | "warning" | "info"> = { high: "error", medium: "warning", low: "info" };

export default function DepartmentDashboardPage() {
  const router = useRouter();
  const [section, setSection] = React.useState("");
  const [year, setYear] = React.useState("");
  const [mentor, setMentor] = React.useState("");
  const [percentile, setPercentile] = React.useState<Baseline>("view");
  const [tab, setTab] = React.useState<DeptTab>("overview");

  const query = useQuery<DeptData>({
    queryKey: ["faculty", "department", section, year, mentor, percentile],
    queryFn: async () => (await api.get("/api/faculty/department", {
      params: { ...(section ? { section } : {}), ...(year ? { year } : {}), ...(mentor ? { mentor } : {}), ...(percentile !== "view" ? { percentile } : {}) },
    })).data.data,
    staleTime: 60_000,
  });
  const d = query.data;

  const csvRows = React.useMemo(
    () => (d?.students ?? []).map((s) => ({
      name: s.name, roll_no: s.roll_no ?? "", section: s.section ?? "", year: s.year ?? "",
      state: s.state, flag: s.flag, badge: s.badge, solved: s.solved, submissions: s.subs,
      accuracy_pct: s.ac_rate, active_days: s.active_days, last_active: s.last_active ?? "",
      reasons: s.reasons.join("; "),
    })),
    [d],
  );

  return (
    <Stack>
      <PageHeader
        title="Department dashboard"
        subtitle={d ? `${d.scope.department ?? "All departments"} · ${d.totals.students} students in this view` : undefined}
        actions={d ? <ExportButton filename="department-students.csv" csv={() => toCsv(csvRows)} disabled={csvRows.length === 0} /> : undefined}
      />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 3 }}>
        <TextField
          select size="small" label="Section" value={section} onChange={(e) => setSection(e.target.value)} sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All sections</MenuItem>
          {(d?.scope.sections ?? []).map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
        <TextField
          select size="small" label="Year" value={year} onChange={(e) => setYear(e.target.value)} sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All years</MenuItem>
          {(d?.scope.years ?? []).map((y) => <MenuItem key={y} value={String(y)}>Year {y}</MenuItem>)}
        </TextField>
        <TextField
          select size="small" label="Mentor" value={mentor} onChange={(e) => setMentor(e.target.value)} sx={{ minWidth: 200 }}
        >
          <MenuItem value="">All mentors</MenuItem>
          <MenuItem value="none">No mentor yet{d ? ` (${d.scope.unmentored})` : ""}</MenuItem>
          {(d?.scope.mentors ?? []).map((m) => <MenuItem key={m.id} value={m.id}>{m.name} ({m.mentees})</MenuItem>)}
        </TextField>
        <TextField
          select size="small" label="Badges compared against" value={percentile} onChange={(e) => setPercentile(e.target.value as Baseline)} sx={{ minWidth: 220 }}
        >
          {BASELINES.map((b) => <MenuItem key={b.value} value={b.value}>{b.label}</MenuItem>)}
        </TextField>
      </Stack>

      {query.isError ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => query.refetch()}>Retry</Button>}>
          {apiErrorMessage(query.error, "Couldn't load the department dashboard.")}
        </Alert>
      ) : query.isLoading ? (
        <Stack spacing={2}><Skeleton variant="rounded" height={110} /><Skeleton variant="rounded" height={140} /><Skeleton variant="rounded" height={300} /></Stack>
      ) : !d ? null : d.totals.students === 0 ? (
        <>
          <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
            <EmptyState
              icon={<GroupsOutlinedIcon />}
              title="No students in this view"
              description="Try clearing the section, year or mentor filter. If every student has graduated, they are under Alumni below, where you can restore them."
            />
          </Card>
          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Alumni</Typography>
            <AlumniTab />
          </Box>
        </>
      ) : (
        <>
          <Tabs
            value={tab}
            onChange={(_, v: DeptTab) => setTab(v)}
            sx={{ borderBottom: "1px solid", borderColor: "outlineVariant", mb: 3 }}
          >
            <Tab value="overview" label="Overview" />
            <Tab value="weekly" label="Weekly progress" />
            <Tab value="rankings" label="Rankings" />
            <Tab value="departments" label="Departments" />
            <Tab value="activity" label="Activity" />
            <Tab value="mentors" label="Mentors" />
            <Tab value="portfolio" label="Portfolio" />
            <Tab value="placement" label="Placement" />
            <Tab value="labs" label="Labs" />
            <Tab value="alumni" label="Alumni" />
          </Tabs>

          {tab === "weekly" && <WeeklyProgressTable students={d.students} />}
          {tab === "rankings" && <RankingsTable students={d.students} />}
          {tab === "departments" && <DepartmentLeaderboard />}
          {tab === "activity" && <DepartmentActivity />}
          {tab === "mentors" && <MentorsTab />}
          {tab === "portfolio" && <PortfolioTab section={section} year={year} mentor={mentor} />}
          {tab === "placement" && <PlacementTab section={section} year={year} />}
          {tab === "labs" && <LabsTab />}
          {tab === "alumni" && <AlumniTab />}
          {tab === "overview" && (
            <>
          {/* ── Where to look first ── */}
          <Stack spacing={1.5} sx={{ mb: 3 }}>
            <Typography variant="subtitle1" fontWeight={600}>What to look at</Typography>
            {d.insights.map((i) => (
              <Alert key={i.title} severity={SEVERITY[i.severity]} icon={<TipsAndUpdatesOutlinedIcon fontSize="small" />}>
                <Typography variant="body2" fontWeight={600}>{i.title}</Typography>
                <Typography variant="caption">{i.detail}</Typography>
              </Alert>
            ))}
          </Stack>

          <Box sx={{ mb: 3 }}><DepartmentInsights section={section} year={year} /></Box>

          <StudentFunnel funnel={d.funnel} total={d.totals.students} />

          <KpiRow min={170}>
            <KpiTile icon={<GroupsOutlinedIcon />} label="Active (7 days)" value={d.totals.active_last_7} total={d.totals.students} />
            <KpiTile icon={<CheckCircleOutlineIcon />} label="Problems solved" value={d.totals.solved} accent="success" help="Distinct problems solved, summed across students" />
            <KpiTile icon={<TrackChangesOutlinedIcon />} label="Avg accuracy" value={d.totals.avg_accuracy} suffix="%" accent="secondary" help="Mean accepted-rate among students who have submitted" />
            <KpiTile icon={<InsightsOutlinedIcon />} label="Avg solved" value={d.totals.avg_solved} accent="tertiary" help="Per student, including those who have not started" />
            <KpiTile icon={<WarningAmberIcon />} label="Needs attention" value={d.flags.red} total={d.totals.students} accent="error" help="Red flag: never started, stuck, or two or more concerns" />
          </KpiRow>

          <ChartRow cols={2}>
            <ChartCard title="Section comparison" subtitle="On track vs needs attention, per section" height={280}>
              <StackedBars
                height={280}
                segments={["On track", "Needs attention"]}
                rows={d.sections.map((s) => ({ label: s.name, "On track": s.on_track, "Needs attention": s.at_risk }))}
              />
            </ChartCard>
            <ChartCard title="Department activity" subtitle="Last 8 weeks" height={280}>
              <TrendLines
                height={280}
                series={[
                  { id: "Submissions", data: d.weekly.map((w) => ({ x: w.week_start.slice(5), y: w.subs })) },
                  { id: "Problems solved", data: d.weekly.map((w) => ({ x: w.week_start.slice(5), y: w.solved })) },
                ]}
              />
            </ChartCard>
          </ChartRow>

          <ChartRow cols={2}>
            <SectionCard
              title="Badge distribution"
              icon={<LocalFireDepartmentOutlinedIcon fontSize="small" />}
              action={<ThresholdsDialog kind="badge" />}
            >
              <Stack spacing={1.25}>
                {d.badges.map((b) => {
                  const pct = d.totals.students ? Math.round((b.count / d.totals.students) * 100) : 0;
                  return (
                    <Box key={b.name}>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                        <Typography variant="body2">{b.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{b.count} · {pct}%</Typography>
                      </Stack>
                      <Box sx={{ height: 8, borderRadius: radius.xs, bgcolor: "surfaceContainerHighest", overflow: "hidden" }}>
                        <Box sx={{ width: `${pct}%`, height: "100%", bgcolor: "primary.main", borderRadius: radius.xs }} />
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
                Badge is the student&apos;s percentile on problems solved within this view, so it moves as the cohort moves.
              </Typography>
            </SectionCard>

            <Leaderboard
              title="Top students"
              subtitle="By problems solved"
              unit=" solved"
              limit={10}
              rows={d.students.map((s) => ({ id: s.id, label: s.name, hint: s.roll_no ?? undefined, value: s.solved }))}
              onRowClick={(r) => router.push(`/faculty/students/${r.id}`)}
              emptyDescription="Students appear here once they solve something."
            />
          </ChartRow>
            </>
          )}
        </>
      )}
    </Stack>
  );
}
