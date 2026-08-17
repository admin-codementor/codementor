"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Skeleton from "@mui/material/Skeleton";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { ChevronRightIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { getUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { EmptyState } from "@/components/ui/States";
import { DifficultyChip } from "@/components/ui/DifficultyChip";
import {
  KpiTile, ActivityHeatmap, TrendChart, StudentScatter, DistributionChart,
  TopicRadar, FunnelChart, TestCaseHeatmap, ItemAnalysisScatter, RankedBars, RiskChips,
} from "@/components/faculty/analytics/Panels";

type Dim = "department" | "year" | "section";
type OverviewTab = "pulse" | "cohorts" | "problems";
const DIMENSIONS: { value: Dim; label: string }[] = [
  { value: "department", label: "Department" },
  { value: "year", label: "Year" },
  { value: "section", label: "Section" },
];
const RANGES = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
  { value: 3650, label: "All time" },
];

interface BoxStats { min: number; q1: number; median: number; q3: number; max: number; mean: number; n: number }
interface Overview {
  scope: { department: string | null; dimension: string; days: number; ownClasses?: boolean; classroomCount?: number | null };
  kpis: Record<string, { value: number; delta: number | null }>;
  daily: { date: string; subs: number; ac: number; activeUsers: number }[];
  activityByDayHour: number[][];
  verdicts: { verdict: string; count: number }[];
  languages: { name: string; subs: number; acRate: number }[];
  cohorts: { cohort: string; students: number; avgSolved: number; acRate: number; activeStudents: number; solvedDistribution: BoxStats | null; avgAttemptsToSolve: number | null }[];
  solvedHistogram: { bucket: string; count: number }[];
  solvedDistribution: BoxStats | null;
  studentScatter: { id: string; name: string; x: number; y: number; solved: number }[];
  hardestProblems: { id: string; title: string; difficulty: string; solveRate: number; attempters: number; subs: number }[];
  mostAttempted: { id: string; title: string; difficulty: string; subs: number; acRate: number }[];
}

export default function FacultyAnalyticsPage() {
  const me = React.useMemo(() => getUser(), []);
  const router = useRouter();

  const [dimension, setDimension] = React.useState<Dim>("department");
  const [days, setDays] = React.useState(3650);
  const [overviewTab, setOverviewTab] = React.useState<OverviewTab>("pulse");
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  // Drill-down targets. Only one is ever set.
  const [cohort, setCohort] = React.useState<string | null>(null);
  const [problemId, setProblemId] = React.useState<string | null>(null);
  const [cohortData, setCohortData] = React.useState<Record<string, unknown> | null>(null);
  const [problemData, setProblemData] = React.useState<Record<string, unknown> | null>(null);
  const [drillLoading, setDrillLoading] = React.useState(false);

  // MCQ item analysis
  const [tests, setTests] = React.useState<{ id: string; title: string; attempt_count: number }[]>([]);
  const [testId, setTestId] = React.useState("");
  const [itemData, setItemData] = React.useState<Record<string, unknown> | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setError("");
    api
      .get(`/api/faculty/analytics/overview?dimension=${dimension}&days=${days}`)
      .then((r) => { if (r.data?.success) setOverview(r.data.data); })
      .catch((e) => setError(apiErrorMessage(e, "Couldn't load analytics.")))
      .finally(() => setLoading(false));
  }, [dimension, days]);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    api.get("/api/mcq/tests")
      .then((r) => { if (r.data?.success) setTests(r.data.data.filter((t: { attempt_count: number }) => t.attempt_count > 0)); })
      .catch(() => { /* item analysis is optional; the panel explains itself when empty */ });
  }, []);

  const openCohort = (name: string) => {
    setProblemId(null); setProblemData(null);
    setCohort(name); setCohortData(null); setDrillLoading(true);
    api
      .get(`/api/faculty/analytics/cohort?dimension=${dimension}&value=${encodeURIComponent(name)}`)
      .then((r) => { if (r.data?.success) setCohortData(r.data.data); })
      .catch((e) => setError(apiErrorMessage(e, "Couldn't load that cohort.")))
      .finally(() => setDrillLoading(false));
  };

  const openProblem = (id: string) => {
    setCohort(null); setCohortData(null);
    setProblemId(id); setProblemData(null); setDrillLoading(true);
    api
      .get(`/api/faculty/analytics/problem/${id}`)
      .then((r) => { if (r.data?.success) setProblemData(r.data.data); })
      .catch((e) => setError(apiErrorMessage(e, "Couldn't load that problem.")))
      .finally(() => setDrillLoading(false));
  };

  const loadItemAnalysis = (id: string) => {
    setTestId(id);
    setItemData(null);
    if (!id) return;
    api
      .get(`/api/faculty/analytics/mcq/${id}`)
      .then((r) => { if (r.data?.success) setItemData(r.data.data); })
      .catch((e) => setError(apiErrorMessage(e, "Couldn't analyse that test.")));
  };

  const scopeNote = overview
    ? overview.scope.ownClasses
      ? `Your classes${overview.scope.classroomCount ? ` (${overview.scope.classroomCount})` : ""}`
      : overview.scope.department
        ? `Department: ${overview.scope.department}`
        : "All departments"
    : me?.role === "admin" ? "All departments" : me?.department ? `Department: ${me.department}` : "Your department";
  const backToOverview = () => { setCohort(null); setProblemId(null); setCohortData(null); setProblemData(null); };

  return (
    <Box>
      <PageHeader title="Analytics" subtitle={`${scopeNote} · drill from the whole cohort down to a single question`} />

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Breadcrumbs separator={<ChevronRightIcon fontSize="small" sx={{ color: "text.disabled" }} />} sx={{ flex: 1 }}>
          <Link component="button" type="button" underline={cohort || problemId ? "hover" : "none"}
            color={cohort || problemId ? "text.secondary" : "text.primary"} onClick={backToOverview} sx={{ fontWeight: 600 }}>
            Overview
          </Link>
          {cohort && <Typography variant="body2" color="text.primary" fontWeight={600}>{cohort}</Typography>}
          {problemId && (
            <Typography variant="body2" color="text.primary" fontWeight={600}>
              {(problemData as { problem?: { title: string } } | null)?.problem?.title ?? "Problem"}
            </Typography>
          )}
        </Breadcrumbs>
        <SegmentedButtons<Dim> value={dimension} onChange={(v) => { backToOverview(); setDimension(v); }} segments={DIMENSIONS} ariaLabel="Group by" />
        <TextField select size="small" label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))} sx={{ width: 130 }}>
          {RANGES.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
        </TextField>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={load}>Retry</Button>}>{error}</Alert>}

      {loading ? (
        <Stack spacing={2}>
          <Skeleton variant="rounded" height={96} />
          <Skeleton variant="rounded" height={300} />
          <Skeleton variant="rounded" height={260} />
        </Stack>
      ) : !overview ? (
        <EmptyState title="No analytics yet" description="Student activity will populate this." />
      ) : overview.scope.ownClasses && overview.scope.classroomCount === 0 ? (
        <EmptyState
          title="No classes yet"
          description="Analytics is scoped to your own classes — create one and have students join, and their activity will show up here."
        />
      ) : cohort ? (
        <CohortView data={cohortData} loading={drillLoading} onStudent={(id) => router.push(`/faculty/students/${id}`)} />
      ) : problemId ? (
        <ProblemView data={problemData} loading={drillLoading} />
      ) : (
        <Stack spacing={2.5}>
          <Tabs
            value={overviewTab}
            onChange={(_, v: OverviewTab) => setOverviewTab(v)}
            sx={{ borderBottom: "1px solid", borderColor: "outlineVariant" }}
          >
            <Tab value="pulse" label="Pulse" />
            <Tab value="cohorts" label="Cohorts" />
            <Tab value="problems" label="Problems & MCQs" />
          </Tabs>

          {overviewTab === "pulse" && (
            <Stack spacing={2.5}>
              {/* ── KPI row ── */}
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
                <KpiTile
                  label="Submissions" value={overview.kpis.submissions.value} delta={overview.kpis.submissions.delta}
                  series={overview.daily.map((d) => d.subs)} help="In the selected period, versus the period before it."
                />
                <KpiTile
                  label="Acceptance rate" value={overview.kpis.acRate.value} suffix="%" delta={overview.kpis.acRate.delta}
                  series={overview.daily.map((d) => (d.subs ? Math.round((d.ac / d.subs) * 100) : 0))}
                />
                <KpiTile
                  label="Active students" value={overview.kpis.activeStudents.value}
                  help="Submitted at least once in the period. No trend arrow — comparing to the previous period needs per-day membership the cache doesn't hold."
                />
                <KpiTile
                  label="Engaged overall" value={`${overview.kpis.engagedStudents.value}/${overview.kpis.totalStudents.value}`}
                  help="Students who have ever submitted, out of everyone in scope."
                />
              </Box>

              {/* ── Distribution first: the headline number hides the shape ── */}
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2.5 }}>
                <SectionCard title="How many problems each student has solved">
                  {overview.solvedDistribution && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                      Median {overview.solvedDistribution.median} · mean {overview.solvedDistribution.mean} · range {overview.solvedDistribution.min}–{overview.solvedDistribution.max}.
                      {overview.solvedDistribution.median === 0 && " Half the cohort has solved nothing — the mean alone would hide that."}
                    </Typography>
                  )}
                  <DistributionChart histogram={overview.solvedHistogram} label="Problems solved" />
                </SectionCard>

                <SectionCard title="Effort vs. success — one dot per student">
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                    Bottom-right means grinding without success; top-left means efficient. Click a dot to open that student.
                  </Typography>
                  <StudentScatter points={overview.studentScatter} onPick={(id) => router.push(`/faculty/students/${id}`)} />
                </SectionCard>
              </Box>

              <SectionCard title="When the work actually happens">
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                  Submissions by day of week and hour — useful for scheduling labs and spotting all-nighters before a deadline.
                </Typography>
                <ActivityHeatmap grid={overview.activityByDayHour} />
              </SectionCard>

              <SectionCard title={overview.daily.length > 45 ? "Activity over time — weekly totals" : "Activity over time"}>
                {overview.daily.length > 1 ? (
                  <>
                    {overview.daily.length > 45 && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                        Grouped into weeks — daily counts this small zigzag too much to show a trend.
                      </Typography>
                    )}
                    <TrendChart daily={overview.daily} />
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">Not enough days in this period to plot a trend.</Typography>
                )}
              </SectionCard>

              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2.5 }}>
                <SectionCard title="Verdicts">
                  <RankedBars rows={overview.verdicts as unknown as Record<string, string | number>[]} valueKey="count" indexKey="verdict" colorIndex={0} />
                </SectionCard>
                <SectionCard title="Languages used">
                  <RankedBars rows={overview.languages as unknown as Record<string, string | number>[]} valueKey="subs" indexKey="name" colorIndex={1} />
                </SectionCard>
              </Box>
            </Stack>
          )}

          {overviewTab === "cohorts" && (
            <Stack spacing={2.5}>
              <SectionCard title={`Cohorts by ${dimension} — who's ahead, who's behind`}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
                  Click a row to drill into that cohort.
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600 } }}>
                        <TableCell>Cohort</TableCell>
                        <TableCell align="right">Students</TableCell>
                        <TableCell align="right">Active</TableCell>
                        <TableCell align="right">Median solved</TableCell>
                        <TableCell align="right">AC rate</TableCell>
                        <TableCell align="right">Attempts / solve</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {overview.cohorts.map((c) => (
                        <TableRow key={c.cohort} hover sx={{ cursor: "pointer" }} onClick={() => openCohort(c.cohort)}>
                          <TableCell><Typography variant="body2" fontWeight={500}>{c.cohort}</Typography></TableCell>
                          <TableCell align="right">{c.students}</TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" color={c.activeStudents === 0 ? "error.main" : undefined}>
                              {c.activeStudents}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">{c.solvedDistribution?.median ?? "—"}</TableCell>
                          <TableCell align="right">{c.acRate}%</TableCell>
                          <TableCell align="right">{c.avgAttemptsToSolve ?? "—"}</TableCell>
                          <TableCell align="right"><ChevronRightIcon fontSize="small" sx={{ color: "text.disabled" }} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </SectionCard>
            </Stack>
          )}

          {overviewTab === "problems" && (
            <Stack spacing={2.5}>
              <SectionCard title="Problems students struggle with most">
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                  Ranked by the share of students who attempted and never solved it. Click one for its funnel and failing test cases.
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600 } }}>
                        <TableCell>Problem</TableCell>
                        <TableCell sx={{ width: 110 }}>Difficulty</TableCell>
                        <TableCell align="right">Tried</TableCell>
                        <TableCell align="right">Solve rate</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {overview.hardestProblems.length === 0 ? (
                        <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">Not enough attempts yet.</Typography></TableCell></TableRow>
                      ) : overview.hardestProblems.map((p) => (
                        <TableRow key={p.id} hover sx={{ cursor: "pointer" }} onClick={() => openProblem(p.id)}>
                          <TableCell><Typography variant="body2">{p.title}</Typography></TableCell>
                          <TableCell><DifficultyChip difficulty={p.difficulty} /></TableCell>
                          <TableCell align="right">{p.attempters}</TableCell>
                          <TableCell align="right">
                            <Chip
                              size="small" label={`${p.solveRate}%`}
                              sx={{
                                height: 20, fontSize: 11, fontWeight: 600,
                                bgcolor: p.solveRate < 40 ? "errorContainer" : p.solveRate < 70 ? "warningContainer" : "successContainer",
                                color: p.solveRate < 40 ? "onErrorContainer" : p.solveRate < 70 ? "onWarningContainer" : "onSuccessContainer",
                              }}
                            />
                          </TableCell>
                          <TableCell align="right"><ChevronRightIcon fontSize="small" sx={{ color: "text.disabled" }} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </SectionCard>

              {/* ── MCQ item analysis ── */}
              <SectionCard
                title="MCQ question quality"
                action={
                  <TextField select size="small" label="Test" value={testId} onChange={(e) => loadItemAnalysis(e.target.value)} sx={{ minWidth: 220 }}>
                    <MenuItem value="">Choose a test…</MenuItem>
                    {tests.map((t) => <MenuItem key={t.id} value={t.id}>{t.title} ({t.attempt_count})</MenuItem>)}
                  </TextField>
                }
              >
                {tests.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No MCQ test has submitted attempts yet.</Typography>
                ) : !itemData ? (
                  <Typography variant="body2" color="text.secondary">
                    Pick a test to see which questions actually separate strong students from weak ones.
                  </Typography>
                ) : (
                  <>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                      {`${(itemData as { attempts: number }).attempts} attempts. `}
                      Questions low on the vertical axis don&apos;t distinguish who knows the material — everyone answers them
                      the same way, so they add length without adding information.
                      {(itemData as { problematic: number }).problematic > 0 && ` ${(itemData as { problematic: number }).problematic} flagged.`}
                    </Typography>
                    <ItemAnalysisScatter items={(itemData as { items: never[] }).items} />
                    <Stack spacing={0.5} sx={{ mt: 1 }}>
                      {((itemData as { items: { position: number; question_text: string; flag: string | null }[] }).items)
                        .filter((i) => i.flag)
                        .map((i) => (
                          <Typography key={i.position} variant="caption" color="warning.main">
                            Q{i.position}: {i.flag} — “{i.question_text.slice(0, 70)}…”
                          </Typography>
                        ))}
                    </Stack>
                  </>
                )}
              </SectionCard>
            </Stack>
          )}
        </Stack>
      )}
    </Box>
  );
}

// ── Level 2: one cohort ───────────────────────────────────────────────────────
function CohortView({ data, loading, onStudent }: { data: Record<string, unknown> | null; loading: boolean; onStudent: (id: string) => void }) {
  if (loading) return <Stack spacing={2}><Skeleton variant="rounded" height={120} /><Skeleton variant="rounded" height={300} /></Stack>;
  if (!data) return <EmptyState title="Couldn't load this cohort" />;
  const d = data as unknown as {
    cohort: string; size: number; empty?: boolean;
    summary: { active: number; acRate: number; solvedDistribution: BoxStats | null };
    solvedHistogram: { bucket: string; count: number }[];
    topicMastery: { topic: string; accuracy: number; attempts: number; students: number }[];
    students: { id: string; name: string; rollNo: string | null; solved: number; subs: number; acRate: number; avgAttemptsToSolve: number | null; riskReasons: string[] }[];
  };
  if (d.empty) return <EmptyState title="No students in this cohort" />;

  const atRisk = d.students.filter((s) => s.riskReasons.length > 0);

  return (
    <Stack spacing={2.5}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
        <KpiTile label="Students" value={d.size} />
        <KpiTile label="Active" value={d.summary.active} help="Have submitted at least once." />
        <KpiTile label="Acceptance rate" value={d.summary.acRate} suffix="%" />
        <KpiTile label="Needing attention" value={atRisk.length} help="Students with at least one risk signal." />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2.5 }}>
        <SectionCard title="Spread of problems solved">
          <DistributionChart histogram={d.solvedHistogram} label="Problems solved" />
        </SectionCard>
        <SectionCard title="Topic mastery">
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            Share of attempts that ended in a solve, per topic — the shape shows where to spend the next lecture.
          </Typography>
          <TopicRadar topics={d.topicMastery} />
        </SectionCard>
      </Box>

      <SectionCard title="Students — those needing attention first">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600 } }}>
                <TableCell>Student</TableCell>
                <TableCell align="right">Solved</TableCell>
                <TableCell align="right">Subs</TableCell>
                <TableCell align="right">AC rate</TableCell>
                <TableCell align="right">Attempts/solve</TableCell>
                <TableCell>Signals</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {d.students.map((s) => (
                <TableRow key={s.id} hover sx={{ cursor: "pointer" }} onClick={() => onStudent(s.id)}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>{s.name}</Typography>
                    {s.rollNo && <Typography variant="caption" color="text.secondary">{s.rollNo}</Typography>}
                  </TableCell>
                  <TableCell align="right">{s.solved}</TableCell>
                  <TableCell align="right">{s.subs}</TableCell>
                  <TableCell align="right">{s.acRate}%</TableCell>
                  <TableCell align="right">{s.avgAttemptsToSolve ?? "—"}</TableCell>
                  <TableCell><RiskChips reasons={s.riskReasons} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </SectionCard>
    </Stack>
  );
}

// ── Level 3: one problem ──────────────────────────────────────────────────────
function ProblemView({ data, loading }: { data: Record<string, unknown> | null; loading: boolean }) {
  if (loading) return <Stack spacing={2}><Skeleton variant="rounded" height={120} /><Skeleton variant="rounded" height={280} /></Stack>;
  if (!data) return <EmptyState title="Couldn't load this problem" />;
  const d = data as unknown as {
    problem: { title: string; difficulty: string; tags: string[] };
    funnel: { stage: string; value: number }[];
    summary: {
      submissions: number; attempters: number; solvers: number; solveRate: number;
      neededMultipleAttempts: number; gaveUp: number;
      attemptsToSolve: BoxStats | null; timeToSolveMinutes: BoxStats | null;
    };
    attemptsHistogram: { bucket: string; count: number }[];
    verdicts: { verdict: string; count: number }[];
    testHeatmap: { testIndex: number; isPublic: boolean; attempts: number; failures: number; failRate: number }[];
    studentsAnalyzed: number;
  };

  return (
    <Stack spacing={2.5}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
        <KpiTile label="Attempted by" value={d.summary.attempters} />
        <KpiTile label="Solved by" value={d.summary.solvers} />
        <KpiTile label="Solve rate" value={d.summary.solveRate} suffix="%" help="Of the students who attempted it." />
        <KpiTile label="Gave up" value={d.summary.gaveUp} help="Attempted but never got an accepted submission." />
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2.5 }}>
        <SectionCard title="Funnel">
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            Separates &quot;nobody tried it&quot; from &quot;everybody tried and failed&quot; — a single solve-rate number can&apos;t.
          </Typography>
          <FunnelChart stages={d.funnel} />
        </SectionCard>
        <SectionCard title="Attempts needed to solve">
          {d.summary.attemptsToSolve ? (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                Median {d.summary.attemptsToSolve.median}, up to {d.summary.attemptsToSolve.max}.
                {d.summary.neededMultipleAttempts > 0 && ` ${d.summary.neededMultipleAttempts} students needed more than one go.`}
              </Typography>
              <DistributionChart histogram={d.attemptsHistogram} label="Attempts before solving" />
            </>
          ) : <Typography variant="body2" color="text.secondary">Nobody has solved this yet.</Typography>}
        </SectionCard>
      </Box>

      <SectionCard title="Which test case fails">
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
          From each student&apos;s most recent submission ({d.studentsAnalyzed} analysed). A dark square is the specific
          edge case the class is missing — usually worth one slide.
        </Typography>
        <TestCaseHeatmap rows={d.testHeatmap} />
      </SectionCard>

      <SectionCard title="Verdicts on this problem">
        <RankedBars rows={d.verdicts as unknown as Record<string, string | number>[]} valueKey="count" indexKey="verdict" colorIndex={4} />
      </SectionCard>
    </Stack>
  );
}
