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
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { getRole } from "@/lib/auth";
import { ExportButton, KpiRow, KpiTile, toCsv } from "@/components/analytics";
import { EmptyState } from "@/components/ui/States";
import { SearchField } from "@/components/ui/SearchField";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { CheckCircleOutlineIcon, GroupsOutlinedIcon, InboxIcon, InsightsOutlinedIcon, TrackChangesOutlinedIcon } from "@/components/ui/icons";
import { radius, typeScale } from "@/theme/tokens";
import { Head, Pager, bodyRow, headRow, useTable } from "./DepartmentTables";
import { PlacementReadiness } from "./PlacementReadiness";
import { DrivesList } from "@/components/tnp/DrivesList";
import { DriveDetail } from "@/components/tnp/DriveDetail";

interface Analytics {
  overview: {
    pool: number; placed: number; in_process: number; not_placed: number; placement_rate: number;
    applied_students: number; engagement_pct: number; avg_applications: number; conversion_pct: number; drives: number;
  };
  funnel: { key: string; label: string; count: number }[];
  by_year: Group[]; by_section: Group[];
  companies: { id: string; company: string; role: string; date: string | null; ctc: string; status: string; eligible: number; applied: number; shortlisted: number; selected: number }[];
  rounds: { round: string; attempted: number; passed: number; failed: number; pass_rate: number }[];
  students: { id: string; name: string; roll_no: string | null; section: string | null; year: number | null; applied: number; shortlisted: number; selected: number; rejected: number; state: "placed" | "in_process" | "not_placed" }[];
  outside: { applications: number; offers: number };
}
interface Group { key: string; label: string; students: number; placed: number; applied_students: number; rate: number }
type View = "analytics" | "readiness" | "drives";
const VIEWS = [{ value: "analytics" as const, label: "Analytics" }, { value: "readiness" as const, label: "Readiness" }, { value: "drives" as const, label: "Drives" }];
type State = "all" | "placed" | "in_process" | "not_placed";
const STATES = [{ value: "all" as const, label: "Everyone" }, { value: "placed" as const, label: "Placed" }, { value: "in_process" as const, label: "In process" }, { value: "not_placed" as const, label: "Not placed" }];
const STATE_STYLE = {
  placed: { label: "Placed", bg: "successContainer", fg: "onSuccessContainer" },
  in_process: { label: "In process", bg: "warningContainer", fg: "onWarningContainer" },
  not_placed: { label: "Not placed", bg: "surfaceContainerHigh", fg: "onSurfaceVariant" },
} as const;

type Student = Analytics["students"][number];
const SORT = {
  name: (r: Student) => r.name,
  applied: (r: Student) => r.applied,
  selected: (r: Student) => r.selected,
};
type SortKey = keyof typeof SORT;
const searchText = (r: Student) => `${r.name} ${r.roll_no ?? ""} ${r.section ?? ""}`;

const fmtDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
const DRIVE_HOME = "/api/placement";

function GroupTable({ title, rows }: { title: string; rows: Group[] }) {
  return (
    <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden", flex: 1 }}>
      <Typography variant="subtitle2" fontWeight={600} sx={{ p: 2, pb: 1 }}>{title}</Typography>
      <TableContainer>
        <Table size="small" aria-label={title}>
          <TableHead>
            <TableRow sx={headRow}>
              <TableCell>{title.replace("By ", "")}</TableCell>
              <TableCell align="right">Students</TableCell>
              <TableCell align="right">Placed</TableCell>
              <TableCell align="right">Rate</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((g) => (
              <TableRow key={g.key} sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                <TableCell>{g.label}</TableCell>
                <TableCell align="right">{g.students}</TableCell>
                <TableCell align="right">{g.placed}</TableCell>
                <TableCell align="right">{g.rate}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

export function AnalyticsView({ section, year, department = "", openDrive }: { section: string; year: string; department?: string; openDrive: (id: string) => void }) {
  const router = useRouter();
  // The Training & Placement office has no access to the faculty student pages, so its rows are not links. Its files leave through the
  // Export page instead, which writes every export to the audit log.
  const canOpen = getRole() !== "tnp";
  const [state, setState] = React.useState<State>("all");
  const query = useQuery<Analytics>({
    queryKey: ["placement", "analytics", section, year, department],
    queryFn: async () => (await api.get(`${DRIVE_HOME}/analytics`, { params: { ...(section ? { section } : {}), ...(year ? { year } : {}), ...(department ? { department } : {}) } })).data.data,
    staleTime: 30_000,
  });
  const d = query.data;
  const rows = React.useMemo(() => (d?.students ?? []).filter((s) => state === "all" || s.state === state), [d, state]);
  const t = useTable<Student, SortKey>(rows, searchText, SORT, { by: "selected", dir: "desc" });

  if (query.isError) {
    return <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => query.refetch()}>Retry</Button>}>{apiErrorMessage(query.error, "Could not load placement analytics.")}</Alert>;
  }
  if (query.isLoading || !d) return <Skeleton variant="rounded" height={320} />;

  const o = d.overview;
  if (o.pool === 0) {
    return <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}><EmptyState compact icon={<GroupsOutlinedIcon />} title="No students in this view" description="Try clearing the section or year filter." /></Card>;
  }
  const top = Math.max(1, ...d.funnel.map((f) => f.count));
  const csv = () => toCsv(t.all.map((s) => ({
    name: s.name, roll_no: s.roll_no ?? "", section: s.section ?? "", year: s.year ?? "",
    status: STATE_STYLE[s.state].label, applications: s.applied, shortlisted: s.shortlisted, selected: s.selected, rejected: s.rejected,
  })));

  return (
    <Stack spacing={3}>
      <Typography variant="body2" color="text.secondary">
        Placed means selected in at least one drive, or an offer recorded as made outside the portal. In process means applied or shortlisted somewhere and not yet selected.
        These figures come from the drives and results recorded on the Drives view.
      </Typography>

      <KpiRow min={170}>
        <KpiTile icon={<GroupsOutlinedIcon />} label="Students" value={o.pool} />
        <KpiTile icon={<CheckCircleOutlineIcon />} accent="success" label="Placed" value={o.placed} total={o.pool} help={`${o.placement_rate}% of the students in this view`} />
        <KpiTile icon={<InsightsOutlinedIcon />} accent="tertiary" label="In process" value={o.in_process} total={o.pool} />
        <KpiTile icon={<InboxIcon />} accent="warning" label="Not placed" value={o.not_placed} total={o.pool} />
        {d.outside.applications > 0 && <KpiTile icon={<TrackChangesOutlinedIcon />} accent="secondary" label="Outside the portal" value={d.outside.offers} help={`${d.outside.offers} offers from ${d.outside.applications} applications made outside drives, counted as placed above`} />}
        <KpiTile icon={<TrackChangesOutlinedIcon />} accent="secondary" label="Engagement" value={o.engagement_pct} suffix="%" help={`${o.applied_students} of ${o.pool} students have applied to at least one drive`} />
        <KpiTile icon={<InsightsOutlinedIcon />} accent="secondary" label="Applications each" value={o.avg_applications} help={`Conversion: ${o.conversion_pct}% of applications ended in an offer`} />
      </KpiRow>

      <Box>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>Placement funnel</Typography>
        <Stack spacing={1.25}>
          {d.funnel.map((f, i) => {
            const prev = i === 0 ? null : d.funnel[i - 1].count;
            return (
              <Stack key={f.key} direction="row" spacing={2} alignItems="center">
                <Typography variant="body2" sx={{ width: 96 }}>{f.label}</Typography>
                <Box sx={{ flex: 1, height: 24, borderRadius: radius.xs, bgcolor: "surfaceContainerHighest", overflow: "hidden" }}>
                  <Box sx={{ width: `${(f.count / top) * 100}%`, height: "100%", bgcolor: "primary.main", minWidth: f.count ? 4 : 0 }} />
                </Box>
                <Typography variant="body2" fontWeight={600} sx={{ width: 40, textAlign: "right" }}>{f.count}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ width: 90 }}>{prev ? `${Math.round((f.count / prev) * 100)}% of ${d.funnel[i - 1].label.toLowerCase()}` : ""}</Typography>
              </Stack>
            );
          })}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          &quot;Eligible&quot; counts a student once for every drive they can take part in.
        </Typography>
      </Box>

      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <GroupTable title="By year" rows={d.by_year} />
        <GroupTable title="By section" rows={d.by_section} />
      </Stack>

      <Box>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>Companies</Typography>
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
          {d.companies.length === 0 ? (
            <EmptyState compact icon={<InboxIcon />} title="No drives yet" description="Create a drive on the Drives view and record results to see company figures." />
          ) : (
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small" aria-label="Company statistics" sx={{ minWidth: 640 }}>
                <TableHead>
                  <TableRow sx={headRow}>
                    <TableCell>Company</TableCell><TableCell align="right">Eligible</TableCell><TableCell align="right">Applied</TableCell>
                    <TableCell align="right">Shortlisted</TableCell><TableCell align="right">Selected</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {d.companies.map((c) => (
                    <TableRow key={c.id} hover onClick={() => openDrive(c.id)} sx={bodyRow}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>{c.company}</Typography>
                        <Typography variant="caption" color="text.secondary">{[c.role, c.ctc, fmtDate(c.date)].filter((x) => x && x !== "—").join(" · ")}</Typography>
                      </TableCell>
                      <TableCell align="right">{c.eligible}</TableCell><TableCell align="right">{c.applied}</TableCell>
                      <TableCell align="right">{c.shortlisted}</TableCell><TableCell align="right">{c.selected}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Card>
      </Box>

      {d.rounds.length > 0 && (
        <Box>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>Round analysis</Typography>
          <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
            <TableContainer>
              <Table size="small" aria-label="Round analysis">
                <TableHead>
                  <TableRow sx={headRow}>
                    <TableCell>Round</TableCell><TableCell align="right">Attempted</TableCell><TableCell align="right">Passed</TableCell>
                    <TableCell align="right">Failed</TableCell><TableCell align="right">Pass rate</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {d.rounds.map((r) => (
                    <TableRow key={r.round} sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                      <TableCell>{r.round}</TableCell><TableCell align="right">{r.attempted}</TableCell>
                      <TableCell align="right">{r.passed}</TableCell><TableCell align="right">{r.failed}</TableCell><TableCell align="right">{r.pass_rate}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Box>
      )}

      <Box>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>Students</Typography>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} sx={{ mb: 2 }}>
          <SearchField value={t.q} onChange={t.setQ} placeholder="Name, roll no or section" label="Search students" sx={{ maxWidth: 320 }} />
          <SegmentedButtons<State> value={state} onChange={setState} segments={STATES} ariaLabel="Placement status" />
          <Box sx={{ flex: 1 }} />
          {canOpen && <ExportButton filename="placement-students.csv" csv={csv} disabled={t.all.length === 0} />}
        </Stack>
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
          {t.all.length === 0 ? (
            <EmptyState compact icon={<GroupsOutlinedIcon />} title="No students match" description="Try a different filter or clear the search." />
          ) : (
            <>
              <TableContainer sx={{ overflowX: "auto" }}>
                <Table size="small" aria-label="Students and placement status" sx={{ minWidth: 640 }}>
                  <TableHead>
                    <TableRow sx={headRow}>
                      <Head<SortKey> id="name" label="Student" sort={t.sort} toggle={t.toggle} />
                      <Head<SortKey> id="applied" label="Applications" sort={t.sort} toggle={t.toggle} align="right" />
                      <Head<SortKey> id="selected" label="Offers" sort={t.sort} toggle={t.toggle} align="right" />
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {t.visible.map((s) => (
                      <TableRow key={s.id} hover={canOpen} onClick={canOpen ? () => router.push(`/faculty/students/${s.id}`) : undefined} sx={canOpen ? bodyRow : { ...bodyRow, cursor: "default" }}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>{s.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{[s.roll_no, s.section && `Sec ${s.section}`, s.year && `Year ${s.year}`].filter(Boolean).join(" · ")}</Typography>
                        </TableCell>
                        <TableCell align="right">{s.applied}</TableCell>
                        <TableCell align="right">{s.selected}</TableCell>
                        <TableCell>
                          <Chip size="small" label={STATE_STYLE[s.state].label} sx={{ height: 22, fontSize: typeScale.labelSmall.fontSize, fontWeight: 600, bgcolor: STATE_STYLE[s.state].bg, color: STATE_STYLE[s.state].fg }} />
                        </TableCell>
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
    </Stack>
  );
}

/** Placement analytics and drives. An HOD reads their department's; the Training & Placement office has the same analytics on its own page. */
export function PlacementTab({ section, year }: { section: string; year: string }) {
  const [view, setView] = React.useState<View>("analytics");
  const [openId, setOpenId] = React.useState<string | null>(null);

  return (
    <Box>
      <SegmentedButtons<View> value={view} onChange={setView} segments={VIEWS} ariaLabel="Placement view" />
      <Box sx={{ mt: 3 }}>
        {view === "analytics" && <AnalyticsView section={section} year={year} openDrive={setOpenId} />}
        {view === "readiness" && <PlacementReadiness section={section} year={year} />}
        {view === "drives" && <DrivesList canManage={false} onOpen={setOpenId} />}
      </Box>
      <Dialog open={!!openId} onClose={() => setOpenId(null)} fullWidth maxWidth="lg" aria-labelledby="hod-drive-title">
        <DialogTitle id="hod-drive-title">Drive</DialogTitle>
        <DialogContent dividers>{openId && <DriveDetail driveId={openId} canManage={false} />}</DialogContent>
        <DialogActions><Button onClick={() => setOpenId(null)}>Close</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
