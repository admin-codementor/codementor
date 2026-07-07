"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Skeleton from "@mui/material/Skeleton";
import Chip from "@mui/material/Chip";
import { ResponsiveBar } from "@nivo/bar";
import { ResponsiveLine } from "@nivo/line";
import { ResponsivePie } from "@nivo/pie";
import { ChevronRightIcon, GroupsOutlinedIcon, PersonOutlineIcon, TrackChangesOutlinedIcon, InsightsOutlinedIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { getUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { SectionCard } from "@/components/ui/SectionCard";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { EmptyState } from "@/components/ui/States";
import { useNivoTheme, useChartColors } from "@/components/ui/nivo";
import { Reveal, RevealGroup, RevealItem, SwapFade } from "@/components/ui/motion";

type Dim = "department" | "year" | "section";
const DIMENSIONS: { value: Dim; label: string }[] = [
  { value: "department", label: "Department" },
  { value: "year", label: "Year" },
  { value: "section", label: "Section" },
];

interface CohortRow { cohort: string; students: number; avg_solved: number; ac_rate: number }
interface StudentRow { id: string; name: string; rollNo: string | null; solved: number; acRate: number }
interface StudentDetail {
  student: { id: string; name: string; department: string | null; section: string | null; year: number | null; rating: number | null };
  totals: { total: number; accepted: number; solved: number; acRate: number };
  learningCurve: { date: string; solved: number }[];
  topicBreakdown: { topic: string; solved: number; attempts: number }[];
  verdictBreakdown: { name: string; value: number }[];
}

const STUDENT_LIMIT = 20;

export default function FacultyAnalyticsPage() {
  const me = React.useMemo(() => getUser(), []);
  const nivoTheme = useNivoTheme();
  const colors = useChartColors();

  const [dimension, setDimension] = React.useState<Dim>("department");
  const [cohort, setCohort] = React.useState<string | null>(null);
  const [studentId, setStudentId] = React.useState<string | null>(null);

  const [cohorts, setCohorts] = React.useState<CohortRow[]>([]);
  const [cohortsLoading, setCohortsLoading] = React.useState(true);
  const [students, setStudents] = React.useState<StudentRow[]>([]);
  const [studentsTotal, setStudentsTotal] = React.useState(0);
  const [studentsLoading, setStudentsLoading] = React.useState(false);
  const [detail, setDetail] = React.useState<StudentDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  React.useEffect(() => {
    setCohortsLoading(true);
    setCohort(null);
    setStudentId(null);
    api
      .get(`/api/faculty/analytics/cohorts?dimension=${dimension}`)
      .then((r) => setCohorts(r.data?.success ? r.data.data : []))
      .catch(() => setCohorts([]))
      .finally(() => setCohortsLoading(false));
  }, [dimension]);

  React.useEffect(() => {
    if (!cohort) return;
    setStudentsLoading(true);
    api
      .get(`/api/faculty/analytics/cohort-students?dimension=${dimension}&value=${encodeURIComponent(cohort)}&limit=${STUDENT_LIMIT}`)
      .then((r) => {
        if (r.data?.success) {
          setStudents(r.data.data);
          setStudentsTotal(r.data.total ?? r.data.data.length);
        }
      })
      .catch(() => setStudents([]))
      .finally(() => setStudentsLoading(false));
  }, [cohort, dimension]);

  React.useEffect(() => {
    if (!studentId) return;
    setDetailLoading(true);
    setDetail(null);
    api
      .get(`/api/faculty/students/${studentId}/detail`)
      .then((r) => setDetail(r.data?.success ? r.data.data : null))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [studentId]);

  const level = studentId ? 3 : cohort ? 2 : 1;
  const selectedStudent = students.find((s) => s.id === studentId);
  const scopeNote =
    me?.role === "admin" ? "All departments" : me?.department ? `Department: ${me.department}` : "Your department";

  const totalStudents = cohorts.reduce((a, c) => a + c.students, 0);
  const overallAvg = cohorts.length ? Math.round(cohorts.reduce((a, c) => a + c.avg_solved, 0) / cohorts.length) : 0;
  const overallAc = cohorts.length ? Math.round(cohorts.reduce((a, c) => a + c.ac_rate, 0) / cohorts.length) : 0;

  return (
    <Box>
      <PageHeader title="Analytics" subtitle={`Drill from cohorts to individual students · ${scopeNote}`} />

      <Breadcrumbs separator={<ChevronRightIcon fontSize="small" sx={{ color: "text.disabled" }} />} sx={{ mb: 2 }}>
        <Link component="button" type="button" underline={level === 1 ? "none" : "hover"} color={level === 1 ? "text.primary" : "text.secondary"} onClick={() => { setCohort(null); setStudentId(null); }} sx={{ fontWeight: 600 }}>
          All cohorts
        </Link>
        {cohort && (
          <Link component="button" type="button" underline={level === 2 ? "none" : "hover"} color={level === 2 ? "text.primary" : "text.secondary"} onClick={() => setStudentId(null)} sx={{ fontWeight: 600 }}>
            {cohort}
          </Link>
        )}
        {selectedStudent && <Typography variant="body2" color="text.primary" fontWeight={600}>{selectedStudent.name}</Typography>}
      </Breadcrumbs>

      <SwapFade swapKey={level === 3 ? `s:${studentId}` : level === 2 ? `c:${cohort}` : `d:${dimension}`}>
        {/* ── Level 1: cohorts ── */}
        {level === 1 && (
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="flex-end">
              <SegmentedButtons<Dim> value={dimension} onChange={setDimension} segments={DIMENSIONS} ariaLabel="Group cohorts by" />
            </Stack>

            {!cohortsLoading && cohorts.length > 0 && (
              <RevealGroup>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
                  <RevealItem><StatCard icon={<GroupsOutlinedIcon />} label="Cohorts" value={cohorts.length} accent="primary" /></RevealItem>
                  <RevealItem><StatCard icon={<PersonOutlineIcon />} label="Students" value={totalStudents} accent="tertiary" /></RevealItem>
                  <RevealItem><StatCard icon={<TrackChangesOutlinedIcon />} label="Avg Solved" value={overallAvg} accent="success" /></RevealItem>
                  <RevealItem><StatCard icon={<InsightsOutlinedIcon />} label="Avg AC Rate" value={`${overallAc}%`} accent="warning" /></RevealItem>
                </Box>
              </RevealGroup>
            )}

            <Reveal>
              <SectionCard title="Cohorts — average problems solved" icon={<GroupsOutlinedIcon sx={{ fontSize: 20, color: "text.secondary" }} />}>
                {cohortsLoading ? (
                  <Skeleton variant="rounded" height={320} />
                ) : cohorts.length === 0 ? (
                  <EmptyState icon={<GroupsOutlinedIcon />} title="No cohort data yet" description="Student activity will populate these cohorts." />
                ) : (
                  <>
                    <Box sx={{ height: 340 }}>
                      <ResponsiveBar
                        data={cohorts.map((c) => ({ cohort: c.cohort, value: c.avg_solved }))}
                        keys={["value"]}
                        indexBy="cohort"
                        margin={{ top: 16, right: 16, bottom: 44, left: 44 }}
                        padding={0.35}
                        borderRadius={6}
                        colors={[colors[0]]}
                        theme={nivoTheme}
                        enableLabel={false}
                        axisLeft={{ tickSize: 0, tickPadding: 8 }}
                        axisBottom={{ tickSize: 0, tickPadding: 8 }}
                        onClick={(d) => setCohort(String(d.indexValue))}
                        role="application"
                        ariaLabel="Average problems solved per cohort"
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary">Click a bar to drill into that cohort&apos;s students.</Typography>
                  </>
                )}
              </SectionCard>
            </Reveal>
          </Stack>
        )}

        {/* ── Level 2: students in cohort ── */}
        {level === 2 && (
          <SectionCard
            title={`${cohort} — top students by problems solved`}
            icon={<GroupsOutlinedIcon sx={{ fontSize: 20, color: "text.secondary" }} />}
            action={<Typography variant="caption" color="text.secondary">{studentsTotal > STUDENT_LIMIT ? `Top ${STUDENT_LIMIT} of ${studentsTotal}` : `${studentsTotal} student${studentsTotal !== 1 ? "s" : ""}`}</Typography>}
          >
            {studentsLoading ? (
              <Skeleton variant="rounded" height={340} />
            ) : students.length === 0 ? (
              <EmptyState icon={<PersonOutlineIcon />} title="No students in this cohort" />
            ) : (
              <>
                <Box sx={{ height: 360 }}>
                  <ResponsiveBar
                    data={students.map((s) => ({ name: s.name, solved: s.solved, id: s.id }))}
                    keys={["solved"]}
                    indexBy="name"
                    margin={{ top: 16, right: 16, bottom: 88, left: 44 }}
                    padding={0.3}
                    borderRadius={6}
                    colors={[colors[1]]}
                    theme={nivoTheme}
                    enableLabel={false}
                    axisLeft={{ tickSize: 0, tickPadding: 8 }}
                    axisBottom={{ tickSize: 0, tickPadding: 8, tickRotation: -35 }}
                    onClick={(d) => setStudentId(String((d.data as { id: string }).id))}
                    role="application"
                    ariaLabel="Problems solved per student"
                  />
                </Box>
                <Typography variant="caption" color="text.secondary">Click a student&apos;s bar to see their individual analysis.</Typography>
              </>
            )}
          </SectionCard>
        )}

        {/* ── Level 3: student detail ── */}
        {level === 3 && (
          <Stack spacing={3}>
            {detailLoading || !detail ? (
              <>
                <Skeleton variant="rounded" height={96} />
                <Skeleton variant="rounded" height={260} />
              </>
            ) : (
              <>
                <RevealGroup>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
                    <RevealItem><StatCard icon={<PersonOutlineIcon />} label="Problems Solved" value={detail.totals.solved} accent="primary" /></RevealItem>
                    <RevealItem><StatCard icon={<GroupsOutlinedIcon />} label="Submissions" value={detail.totals.total} accent="tertiary" /></RevealItem>
                    <RevealItem><StatCard icon={<TrackChangesOutlinedIcon />} label="AC Rate" value={`${detail.totals.acRate}%`} accent="success" /></RevealItem>
                    <RevealItem><StatCard icon={<InsightsOutlinedIcon />} label="Rating" value={detail.student.rating ?? 1200} accent="warning" /></RevealItem>
                  </Box>
                </RevealGroup>

                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 3 }}>
                  <Reveal>
                    <SectionCard title="Learning curve (cumulative solved)">
                      {detail.learningCurve.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>No accepted submissions yet.</Typography>
                      ) : (
                        <Box sx={{ height: 260 }}>
                          <ResponsiveLine
                            data={[{ id: "solved", data: detail.learningCurve.map((p) => ({ x: p.date, y: p.solved })) }]}
                            margin={{ top: 16, right: 20, bottom: 40, left: 44 }}
                            xScale={{ type: "point" }}
                            yScale={{ type: "linear", min: 0, max: "auto" }}
                            curve="monotoneX"
                            colors={[colors[0]]}
                            theme={nivoTheme}
                            enableArea
                            areaOpacity={0.12}
                            enablePoints={false}
                            enableGridX={false}
                            axisBottom={{ tickSize: 0, tickPadding: 8, tickRotation: -35 }}
                            axisLeft={{ tickSize: 0, tickPadding: 8 }}
                            useMesh
                          />
                        </Box>
                      )}
                    </SectionCard>
                  </Reveal>

                  <Reveal>
                    <SectionCard title="Verdict mix">
                      {detail.verdictBreakdown.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>No submissions yet.</Typography>
                      ) : (
                        <Box sx={{ height: 260 }}>
                          <ResponsivePie
                            data={detail.verdictBreakdown.map((v) => ({ id: v.name, label: v.name, value: v.value }))}
                            margin={{ top: 16, right: 16, bottom: 16, left: 16 }}
                            innerRadius={0.55}
                            padAngle={1.2}
                            cornerRadius={4}
                            colors={colors}
                            theme={nivoTheme}
                            borderWidth={0}
                            enableArcLinkLabels={false}
                            arcLabelsSkipAngle={16}
                          />
                        </Box>
                      )}
                    </SectionCard>
                  </Reveal>
                </Box>

                <Reveal>
                  <SectionCard title="Topic breakdown (solved vs attempts)">
                    {detail.topicBreakdown.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>No topic activity yet.</Typography>
                    ) : (
                      <Box sx={{ height: 300 }}>
                        <ResponsiveBar
                          data={detail.topicBreakdown.map((t) => ({ topic: t.topic, Solved: t.solved, Attempts: t.attempts }))}
                          keys={["Solved", "Attempts"]}
                          indexBy="topic"
                          groupMode="grouped"
                          margin={{ top: 16, right: 16, bottom: 64, left: 44 }}
                          padding={0.3}
                          borderRadius={4}
                          colors={[colors[2], colors[5]]}
                          theme={nivoTheme}
                          enableLabel={false}
                          axisLeft={{ tickSize: 0, tickPadding: 8 }}
                          axisBottom={{ tickSize: 0, tickPadding: 8, tickRotation: -35 }}
                          legends={[{ dataFrom: "keys", anchor: "top-right", direction: "row", translateY: -12, itemWidth: 80, itemHeight: 16, symbolSize: 12, symbolShape: "circle" }]}
                        />
                      </Box>
                    )}
                  </SectionCard>
                </Reveal>

                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {detail.student.department && <Chip label={detail.student.department} size="small" variant="outlined" sx={{ borderColor: "outlineVariant" }} />}
                  {detail.student.year && <Chip label={`Year ${detail.student.year}`} size="small" variant="outlined" sx={{ borderColor: "outlineVariant" }} />}
                  {detail.student.section && <Chip label={`Section ${detail.student.section}`} size="small" variant="outlined" sx={{ borderColor: "outlineVariant" }} />}
                </Stack>
              </>
            )}
          </Stack>
        )}
      </SwapFade>
    </Box>
  );
}
