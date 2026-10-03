"use client";

import * as React from "react";
import NextLink from "next/link";
import { useParams, useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/States";
import { ChartCard, ChartRow, KpiRow, KpiTile, Leaderboard, StackedBars } from "@/components/analytics";
import { ExportButton, toCsv } from "@/components/analytics/ExportButton";
import {
  AssignmentOutlinedIcon, ChevronRightIcon, EmojiEventsOutlinedIcon, PolicyOutlinedIcon,
  TimerOutlinedIcon, WarningAmberIcon,
} from "@/components/ui/icons";

interface SectionScore { id: string; title: string; type: string; score: number; total: number }
interface ProctorInfo {
  tab_switches: number; fullscreen_exits: number; pastes: number; copies: number;
  total: number; risk: "low" | "medium" | "high";
}
interface AttemptRow {
  userId: string; name: string; rollNo: string | null; department: string | null; section: string | null;
  score: number | null; total: number | null; percent: number | null; minutesTaken: number | null;
  submittedAt: string | null; sectionScores: SectionScore[]; proctor: ProctorInfo | null;
}
interface QuestionStat { id: string; question_text: string; topic: string | null; answered: number; correct: number; accuracy: number }
interface ProblemStat { id: string; title: string; attempted: number; accepted: number; accuracy: number; avgScore: number }
interface SectionStat { id: string; title: string; type: string; question_stats?: QuestionStat[]; problem_stats?: ProblemStat[] }
interface ReportData {
  attempts: AttemptRow[];
  summary: {
    attempts: number; avgScore: number; maxScore: number; totalMarks: number | null;
    avgPercent: number | null; medianMinutes: number | null;
    flaggedStudents: number; similarityPairs: number;
  };
  scoreBands: { label: string; count: number }[];
  sections: SectionStat[];
  similarity: { student_a: string; student_b: string; similarity: number }[];
}

type TabKey = "overview" | "questions" | "students" | "integrity";

const RISK_STYLE: Record<string, { bg: string; fg: string }> = {
  high: { bg: "errorContainer", fg: "onErrorContainer" },
  medium: { bg: "warningContainer", fg: "onWarningContainer" },
  low: { bg: "surfaceContainerHigh", fg: "onSurfaceVariant" },
};

export default function ExamReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = React.useState<TabKey>("overview");

  const query = useQuery<ReportData>({
    queryKey: ["faculty", "exam-report", id],
    queryFn: async () => (await api.get(`/api/exams/${id}/results`)).data.data,
    staleTime: 60_000,
  });
  const d = query.data;

  // Section-wise average, recomputed per attempt on the server and averaged here:
  // it answers "which section cost the class marks", which the total cannot.
  const sectionAverages = React.useMemo(() => {
    if (!d?.attempts.length) return [];
    const acc = new Map<string, { title: string; score: number; total: number; n: number }>();
    for (const a of d.attempts) {
      for (const s of a.sectionScores || []) {
        const cur = acc.get(s.id) || { title: s.title, score: 0, total: s.total, n: 0 };
        cur.score += s.score;
        cur.n += 1;
        acc.set(s.id, cur);
      }
    }
    return [...acc.values()].map((s) => ({
      label: s.title,
      Scored: Math.round((s.score / s.n) * 10) / 10,
      Lost: Math.max(0, Math.round((s.total - s.score / s.n) * 10) / 10),
    }));
  }, [d]);

  const csvRows = React.useMemo(
    () => (d?.attempts ?? []).map((a) => ({
      name: a.name, roll_no: a.rollNo ?? "", department: a.department ?? "", section: a.section ?? "",
      score: a.score ?? "", total: a.total ?? "", percent: a.percent ?? "",
      minutes_taken: a.minutesTaken ?? "", submitted_at: a.submittedAt ?? "",
      proctor_flags: a.proctor?.total ?? 0, risk: a.proctor?.risk ?? "low",
    })),
    [d],
  );

  return (
    <Stack>
      <Breadcrumbs separator={<ChevronRightIcon fontSize="small" sx={{ color: "text.disabled" }} />} sx={{ mb: 1.5 }}>
        <Link component={NextLink} href="/faculty/exams" underline="hover" color="text.secondary">Exams</Link>
        <Typography variant="body2" color="text.primary" fontWeight={600}>Report</Typography>
      </Breadcrumbs>

      <PageHeader
        title="Exam report"
        subtitle={d ? `${d.summary.attempts} submitted attempt${d.summary.attempts === 1 ? "" : "s"}` : undefined}
        actions={d ? <ExportButton filename="exam-report.csv" csv={() => toCsv(csvRows)} disabled={csvRows.length === 0} /> : undefined}
      />

      {query.isError ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => query.refetch()}>Retry</Button>}>
          {apiErrorMessage(query.error, "Couldn't load this exam report.")}
        </Alert>
      ) : query.isLoading ? (
        <Stack spacing={2}><Skeleton variant="rounded" height={110} /><Skeleton variant="rounded" height={320} /></Stack>
      ) : !d ? null : d.summary.attempts === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState
            icon={<AssignmentOutlinedIcon />}
            title="Nobody has submitted yet"
            description="Once students submit this exam, the score distribution, section breakdown and integrity signals appear here."
          />
        </Card>
      ) : (
        <>
          <KpiRow min={170}>
            <KpiTile icon={<AssignmentOutlinedIcon />} label="Submitted" value={d.summary.attempts} />
            <KpiTile
              icon={<EmojiEventsOutlinedIcon />}
              label="Average"
              value={d.summary.avgPercent ?? d.summary.avgScore}
              suffix={d.summary.avgPercent != null ? "%" : undefined}
              accent="primary"
              help={d.summary.totalMarks ? `Mean score out of ${d.summary.totalMarks}` : undefined}
            />
            <KpiTile icon={<EmojiEventsOutlinedIcon />} label="Top score" value={d.summary.maxScore} total={d.summary.totalMarks ?? undefined} accent="success" />
            <KpiTile
              icon={<TimerOutlinedIcon />}
              label="Median time"
              value={d.summary.medianMinutes ?? "—"}
              suffix={d.summary.medianMinutes != null ? " min" : undefined}
              accent="secondary"
              help="Between starting and submitting"
            />
            <KpiTile
              icon={<WarningAmberIcon />}
              label="Flagged"
              value={d.summary.flaggedStudents}
              total={d.summary.attempts}
              accent="error"
              help="Students with 3 or more proctor events during this exam"
              onClick={() => setTab("integrity")}
            />
          </KpiRow>

          <Tabs value={tab} onChange={(_, v: TabKey) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: "outlineVariant" }} aria-label="Report sections">
            <Tab value="overview" label="Overview" />
            <Tab value="questions" label="Questions & problems" />
            <Tab value="students" label={`Students (${d.summary.attempts})`} />
            <Tab value="integrity" label={`Integrity (${d.summary.flaggedStudents + d.summary.similarityPairs})`} />
          </Tabs>

          {tab === "overview" && (
            <ChartRow cols={2}>
              <ChartCard title="Score distribution" subtitle="How many students landed in each band" height={280}>
                <StackedBars height={280} segments={["count"]} rows={d.scoreBands.map((b) => ({ label: b.label, count: b.count }))} />
              </ChartCard>
              <ChartCard
                title="Section performance"
                subtitle="Average marks scored vs lost, per section"
                height={280}
                empty={sectionAverages.length === 0}
                emptyDescription="Section scores appear once attempts are submitted."
              >
                <StackedBars height={280} segments={["Scored", "Lost"]} rows={sectionAverages} />
              </ChartCard>
            </ChartRow>
          )}

          {tab === "questions" && (
            <Stack spacing={2}>
              {d.sections.map((s) => {
                const rows = s.type === "mcq"
                  ? (s.question_stats ?? []).map((q) => ({ id: q.id, label: q.question_text.slice(0, 60), hint: q.topic ?? undefined, value: q.accuracy }))
                  : (s.problem_stats ?? []).map((p) => ({ id: p.id, label: p.title, hint: `${p.accepted}/${p.attempted} solved`, value: p.accuracy }));
                return (
                  <Leaderboard
                    key={s.id}
                    title={s.title}
                    subtitle={`${s.type === "mcq" ? "Questions" : "Problems"} by accuracy — lowest first finds what to reteach`}
                    unit="%"
                    limit={30}
                    rows={rows}
                    emptyDescription="No questions in this section yet."
                  />
                );
              })}
            </Stack>
          )}

          {tab === "students" && (
            <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
              <TableContainer sx={{ overflowX: "auto" }}>
                <Table size="small" aria-label="Attempts">
                  <TableHead>
                    <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600, borderColor: "outlineVariant" } }}>
                      <TableCell>Student</TableCell>
                      <TableCell>Dept · Sec</TableCell>
                      <TableCell align="right">Score</TableCell>
                      <TableCell align="right">%</TableCell>
                      <TableCell align="right">Time</TableCell>
                      <TableCell>Integrity</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {d.attempts.map((a) => (
                      <TableRow
                        key={a.userId}
                        hover
                        sx={{ cursor: "pointer", "& td": { borderColor: "outlineVariant" } }}
                        onClick={() => router.push(`/faculty/students/${a.userId}`)}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>{a.name}</Typography>
                          {a.rollNo && <Typography variant="caption" color="text.secondary">{a.rollNo}</Typography>}
                        </TableCell>
                        <TableCell><Typography variant="caption" color="text.secondary">{[a.department, a.section].filter(Boolean).join(" · ") || "—"}</Typography></TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{a.score ?? "—"}{a.total ? ` / ${a.total}` : ""}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{a.percent != null ? `${a.percent}%` : "—"}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{a.minutesTaken != null ? `${a.minutesTaken}m` : "—"}</TableCell>
                        <TableCell>
                          {a.proctor && a.proctor.risk !== "low" ? (
                            <Chip
                              size="small"
                              label={`${a.proctor.total} flags`}
                              sx={{ height: 20, fontSize: 11, ...RISK_STYLE[a.proctor.risk], bgcolor: RISK_STYLE[a.proctor.risk].bg, color: RISK_STYLE[a.proctor.risk].fg }}
                            />
                          ) : (
                            <Typography variant="caption" color="text.secondary">clean</Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          )}

          {tab === "integrity" && (
            <Stack spacing={2}>
              <Alert severity="info" icon={<PolicyOutlinedIcon fontSize="small" />}>
                These are signals to look into, not proof of cheating. Proctor events are recorded during this exam;
                similarity comes from plagiarism checks run anywhere on the platform, so a pair may relate to other work.
              </Alert>

              <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
                <Box sx={{ p: 2.5 }}>
                  <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>Proctor events during this exam</Typography>
                  {d.attempts.filter((a) => a.proctor && a.proctor.total > 0).length === 0 ? (
                    <EmptyState title="No proctor events" description="Nobody switched tabs, left fullscreen or pasted during this exam." />
                  ) : (
                    <TableContainer sx={{ overflowX: "auto" }}>
                      <Table size="small" aria-label="Proctor events">
                        <TableHead>
                          <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600, borderColor: "outlineVariant" } }}>
                            <TableCell>Student</TableCell>
                            <TableCell align="right">Tab switches</TableCell>
                            <TableCell align="right">Fullscreen exits</TableCell>
                            <TableCell align="right">Pastes</TableCell>
                            <TableCell>Risk</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {d.attempts
                            .filter((a) => a.proctor && a.proctor.total > 0)
                            .sort((a, b) => (b.proctor?.total ?? 0) - (a.proctor?.total ?? 0))
                            .map((a) => (
                              <TableRow key={a.userId} hover sx={{ "& td": { borderColor: "outlineVariant" } }}>
                                <TableCell>{a.name}</TableCell>
                                <TableCell align="right">{a.proctor?.tab_switches}</TableCell>
                                <TableCell align="right">{a.proctor?.fullscreen_exits}</TableCell>
                                <TableCell align="right">{a.proctor?.pastes}</TableCell>
                                <TableCell>
                                  <Chip
                                    size="small"
                                    label={a.proctor?.risk}
                                    sx={{ height: 20, fontSize: 11, textTransform: "capitalize", bgcolor: RISK_STYLE[a.proctor?.risk ?? "low"].bg, color: RISK_STYLE[a.proctor?.risk ?? "low"].fg }}
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              </Card>

              <Leaderboard
                title="Code similarity between students who sat this exam"
                subtitle="From plagiarism checks across the platform"
                unit="%"
                limit={20}
                rows={d.similarity.map((p, i) => ({ id: i, label: `${p.student_a} ↔ ${p.student_b}`, value: p.similarity }))}
                emptyDescription="No flagged pairs involve two students from this exam. Run a plagiarism check on an assignment to populate this."
              />
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}
