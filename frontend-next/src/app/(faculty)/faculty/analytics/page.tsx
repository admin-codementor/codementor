"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Skeleton from "@mui/material/Skeleton";
import { ResponsiveBar } from "@nivo/bar";
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

const STUDENT_LIMIT = 20;

export default function FacultyAnalyticsPage() {
  const me = React.useMemo(() => getUser(), []);
  const router = useRouter();
  const nivoTheme = useNivoTheme();
  const colors = useChartColors();

  const [dimension, setDimension] = React.useState<Dim>("department");
  const [cohort, setCohort] = React.useState<string | null>(null);

  const [cohorts, setCohorts] = React.useState<CohortRow[]>([]);
  const [cohortsLoading, setCohortsLoading] = React.useState(true);
  const [students, setStudents] = React.useState<StudentRow[]>([]);
  const [studentsTotal, setStudentsTotal] = React.useState(0);
  const [studentsLoading, setStudentsLoading] = React.useState(false);

  React.useEffect(() => {
    setCohortsLoading(true);
    setCohort(null);
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

  const level = cohort ? 2 : 1;
  const scopeNote =
    me?.role === "admin" ? "All departments" : me?.department ? `Department: ${me.department}` : "Your department";

  const totalStudents = cohorts.reduce((a, c) => a + c.students, 0);
  const overallAvg = cohorts.length ? Math.round(cohorts.reduce((a, c) => a + c.avg_solved, 0) / cohorts.length) : 0;
  const overallAc = cohorts.length ? Math.round(cohorts.reduce((a, c) => a + c.ac_rate, 0) / cohorts.length) : 0;

  return (
    <Box>
      <PageHeader title="Analytics" subtitle={`Drill from cohorts to individual students · ${scopeNote}`} />

      <Breadcrumbs separator={<ChevronRightIcon fontSize="small" sx={{ color: "text.disabled" }} />} sx={{ mb: 2 }}>
        <Link component="button" type="button" underline={level === 1 ? "none" : "hover"} color={level === 1 ? "text.primary" : "text.secondary"} onClick={() => setCohort(null)} sx={{ fontWeight: 600 }}>
          All cohorts
        </Link>
        {cohort && <Typography variant="body2" color="text.primary" fontWeight={600}>{cohort}</Typography>}
      </Breadcrumbs>

      <SwapFade swapKey={level === 2 ? `c:${cohort}` : `d:${dimension}`}>
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
                    onClick={(d) => router.push(`/faculty/students/${(d.data as { id: string }).id}`)}
                    role="application"
                    ariaLabel="Problems solved per student"
                  />
                </Box>
                <Typography variant="caption" color="text.secondary">Click a student&apos;s bar to open their full profile.</Typography>
              </>
            )}
          </SectionCard>
        )}
      </SwapFade>
    </Box>
  );
}
