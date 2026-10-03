"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
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
  ChartCard, ChartRow, ExportButton, KpiRow, KpiTile, Leaderboard, StackedBars, TrendLines, toCsv,
} from "@/components/analytics";
import { interactiveSurfaceSx } from "@/components/ui/interactive";
import { shape } from "@/theme/tokens";
import {
  CheckCircleOutlineIcon, GroupsOutlinedIcon, InsightsOutlinedIcon, LocalFireDepartmentOutlinedIcon,
  TipsAndUpdatesOutlinedIcon, TrackChangesOutlinedIcon, WarningAmberIcon,
} from "@/components/ui/icons";

interface FunnelStudent { id: string; name: string; roll_no: string | null; section: string | null; reasons: string[] }
interface FunnelBucket { key: string; label: string; count: number; students: FunnelStudent[] }
interface StudentRow {
  id: string; name: string; roll_no: string | null; section: string | null; year: number | null;
  subs: number; accepted: number; solved: number; ac_rate: number; active_days: number;
  last_active: string | null; state: string; flag: string; reasons: string[];
  percentile: number; badge: string;
}
interface DeptData {
  totals: { students: number; active_last_7: number; submissions: number; solved: number; avg_solved: number; avg_accuracy: number };
  funnel: FunnelBucket[];
  flags: { red: number; orange: number; green: number };
  sections: { name: string; students: number; avg_solved: number; at_risk: number; at_risk_pct: number; on_track: number; on_track_pct: number }[];
  badges: { name: string; count: number }[];
  weekly: { week_start: string; week_end: string; subs: number; solved: number; active_days: number; subs_change: number | null }[];
  insights: { severity: "high" | "medium" | "low"; title: string; detail: string }[];
  students: StudentRow[];
  scope: { department: string | null; section: string | null; year: string | null; sections: string[]; years: number[] };
}

const FUNNEL_STYLE: Record<string, { bg: string; fg: string; help: string }> = {
  not_started: { bg: "errorContainer", fg: "onErrorContainer", help: "Has never submitted anything" },
  practising: { bg: "successContainer", fg: "onSuccessContainer", help: "Submitted recently and solving problems" },
  stuck: { bg: "warningContainer", fg: "onWarningContainer", help: "Submitting, but nothing accepted yet" },
  gone_quiet: { bg: "secondaryContainer", fg: "onSecondaryContainer", help: "Was active before, silent for 7+ days" },
};

const SEVERITY: Record<string, "error" | "warning" | "info"> = { high: "error", medium: "warning", low: "info" };

export default function DepartmentDashboardPage() {
  const router = useRouter();
  const [section, setSection] = React.useState("");
  const [year, setYear] = React.useState("");
  const [open, setOpen] = React.useState<FunnelBucket | null>(null);

  const query = useQuery<DeptData>({
    queryKey: ["faculty", "department", section, year],
    queryFn: async () => (await api.get("/api/faculty/department", {
      params: { ...(section ? { section } : {}), ...(year ? { year } : {}) },
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
      </Stack>

      {query.isError ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => query.refetch()}>Retry</Button>}>
          {apiErrorMessage(query.error, "Couldn't load the department dashboard.")}
        </Alert>
      ) : query.isLoading ? (
        <Stack spacing={2}><Skeleton variant="rounded" height={110} /><Skeleton variant="rounded" height={140} /><Skeleton variant="rounded" height={300} /></Stack>
      ) : !d ? null : d.totals.students === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState
            icon={<GroupsOutlinedIcon />}
            title="No students in this view"
            description="Try clearing the section or year filter. If your department has no students yet, they appear here once their accounts are created."
          />
        </Card>
      ) : (
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

          {/* ── Funnel: every count opens the list of who is in it ── */}
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>Where every student stands</Typography>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, mb: 1 }}>
            {d.funnel.map((f) => {
              const st = FUNNEL_STYLE[f.key];
              return (
                <Card
                  key={f.key}
                  variant="outlined"
                  component="button"
                  type="button"
                  onClick={() => setOpen(f)}
                  aria-label={`${f.label}: ${f.count} students`}
                  sx={{
                    all: "unset", boxSizing: "border-box", cursor: "pointer", p: 2.5,
                    borderRadius: `${shape.large}px`, bgcolor: st.bg, color: st.fg,
                    ...interactiveSurfaceSx,
                    "&:focus-visible": { outline: "2px solid var(--mui-palette-primary-main)", outlineOffset: 2 },
                  }}
                >
                  <Typography variant="overline" sx={{ opacity: 0.85 }}>{f.label}</Typography>
                  <Typography variant="h4" fontWeight={700} sx={{ lineHeight: 1.1 }}>{f.count}</Typography>
                  <Typography variant="caption" sx={{ opacity: 0.85, display: "block", mt: 0.5 }}>{st.help}</Typography>
                </Card>
              );
            })}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 3 }}>
            {`These four add up to all ${d.totals.students} students. Click any one to see who is in it. "Gone quiet" means no submission for 7 days.`}
          </Typography>

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
            <SectionCard title="Badge distribution" icon={<LocalFireDepartmentOutlinedIcon fontSize="small" />}>
              <Stack spacing={1.25}>
                {d.badges.map((b) => {
                  const pct = d.totals.students ? Math.round((b.count / d.totals.students) * 100) : 0;
                  return (
                    <Box key={b.name}>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                        <Typography variant="body2">{b.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{b.count} · {pct}%</Typography>
                      </Stack>
                      <Box sx={{ height: 8, borderRadius: 4, bgcolor: "surfaceContainerHighest", overflow: "hidden" }}>
                        <Box sx={{ width: `${pct}%`, height: "100%", bgcolor: "primary.main", borderRadius: 4 }} />
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

          {/* ── Funnel drill-down ── */}
          <Dialog open={!!open} onClose={() => setOpen(null)} fullWidth maxWidth="sm" aria-labelledby="funnel-title">
            <DialogTitle id="funnel-title">
              {open?.label} · {open?.count} student{open?.count === 1 ? "" : "s"}
            </DialogTitle>
            <DialogContent dividers>
              {!open?.students.length ? (
                <EmptyState title="Nobody in this group" description="Nothing to act on here right now." />
              ) : (
                <List disablePadding>
                  {open.students.map((s) => (
                    <ListItemButton key={s.id} onClick={() => router.push(`/faculty/students/${s.id}`)} sx={{ borderRadius: 1 }}>
                      <ListItemText
                        primary={
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                            <span>{s.name}</span>
                            {s.roll_no && <Chip size="small" label={s.roll_no} sx={{ height: 18, fontSize: 10 }} />}
                            {s.section && <Chip size="small" label={`Sec ${s.section}`} sx={{ height: 18, fontSize: 10 }} />}
                          </Stack>
                        }
                        secondary={s.reasons.length ? s.reasons.join(" · ") : "No concerns recorded"}
                      />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </DialogContent>
            <DialogActions>
              <ExportButton
                filename={`${open?.key ?? "group"}-students.csv`}
                csv={() => toCsv((open?.students ?? []).map((s) => ({
                  name: s.name, roll_no: s.roll_no ?? "", section: s.section ?? "", reasons: s.reasons.join("; "),
                })))}
                disabled={!open?.students.length}
              />
              <Button onClick={() => setOpen(null)}>Close</Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </Stack>
  );
}
