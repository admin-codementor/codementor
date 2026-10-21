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
import MenuItem from "@mui/material/MenuItem";
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
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useToast } from "@/components/feedback/ToastProvider";
import { ExportButton, KpiTile, toCsv } from "@/components/analytics";
import { GroupsOutlinedIcon, CheckCircleOutlineIcon, TimerOutlinedIcon, WarningAmberIcon, AssignmentOutlinedIcon } from "@/components/ui/icons";
import { bodyRow, headRow } from "@/components/faculty/DepartmentTables";

type TabKey = "summary" | "late" | "daily" | "reopen";

interface Summary { students: number; active7: number; active30: number; submissions7: number; accepted7: number; solvedDistinct7: number; neverSubmitted: number; overdueAssignments: number; pendingReopen: number }
interface DailyRow { id: string; name: string; rollNo: string | null; section: string | null; submissions: number; accepted: number; problemsTried: number; solvedForFirstTime: number; firstAt: string; lastAt: string }
interface Daily { day: string; totals: { students: number; active: number; submissions: number; solvedForFirstTime: number }; rows: DailyRow[] }
interface LateCandidate { id: string; title: string; deadline: string; problems: number }
interface LateRow { id: string; name: string; rollNo: string | null; lateProblems: number; onTimeProblems: number; totalProblems: number; hoursLate: number | null }
interface Late { assignment: { id: string; title: string; deadline: string }; rows: LateRow[]; neverSolved: number; students: number }
interface Reopen { id: string; studentId: string; studentName: string; rollNo: string | null; targetType: "assignment" | "module"; title: string; deadline: string | null; reason: string; status: "pending" | "approved" | "declined"; decisionNote: string; reopenUntil: string | null; createdAt: string }

const todayIst = () => new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

const get = async <T,>(url: string, params?: Record<string, string>) => (await api.get<{ success: boolean; data: T }>(url, { params })).data.data;

// ── Summary ──────────────────────────────────────────────────────────────────
function SummaryTab({ onGo }: { onGo: (t: TabKey) => void }) {
  const q = useQuery<Summary>({ queryKey: ["reports", "summary"], queryFn: () => get("/api/faculty/reports/summary"), staleTime: 60_000 });
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data) return <Skeleton variant="rounded" height={160} />;
  const d = q.data;
  return (
    <Stack spacing={2.5}>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" } }}>
        <KpiTile icon={<GroupsOutlinedIcon />} label="Students" value={d.students} />
        <KpiTile icon={<GroupsOutlinedIcon />} label="Active in 7 days" value={d.active7} total={d.students} accent="success" help={`${d.active30} active in 30 days`} />
        <KpiTile icon={<CheckCircleOutlineIcon />} label="Submissions (7 days)" value={d.submissions7} accent="secondary" help={`${d.accepted7} accepted`} />
        <KpiTile icon={<CheckCircleOutlineIcon />} label="Problems solved (7 days)" value={d.solvedDistinct7} accent="tertiary" help="Each student's distinct problems, counted once." />
        <KpiTile icon={<WarningAmberIcon />} label="Never submitted" value={d.neverSubmitted} total={d.students} accent="warning" />
        <KpiTile icon={<AssignmentOutlinedIcon />} label="Overdue assignments" value={d.overdueAssignments} accent="error" onClick={() => onGo("late")} help="Open the late-work report" />
        <KpiTile icon={<TimerOutlinedIcon />} label="Requests waiting" value={d.pendingReopen} accent={d.pendingReopen ? "warning" : "primary"} onClick={() => onGo("reopen")} help="Students asking for more time" />
      </Box>
      <Typography variant="caption" color="text.secondary">Figures cover your own students (classes for faculty, department for an HOD). A day is the college day, IST.</Typography>
    </Stack>
  );
}

// ── Late work ────────────────────────────────────────────────────────────────
function LateTab() {
  const [id, setId] = React.useState("");
  const list = useQuery<LateCandidate[]>({ queryKey: ["reports", "late-list"], queryFn: () => get("/api/faculty/reports/late/assignments"), staleTime: 60_000 });
  const report = useQuery<Late>({ queryKey: ["reports", "late", id], enabled: !!id, queryFn: () => get("/api/faculty/reports/late", { assignmentId: id }) });
  const d = report.data;
  const csv = () => toCsv((d?.rows ?? []).map((r) => ({ name: r.name, roll_no: r.rollNo ?? "", late_problems: r.lateProblems, on_time_problems: r.onTimeProblems, total_problems: r.totalProblems, hours_late: r.hoursLate ?? "" })));
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
        <TextField select size="small" label="Assignment (deadline passed)" value={id} onChange={(e) => setId(e.target.value)} sx={{ minWidth: 320 }} disabled={list.isLoading}>
          {(list.data ?? []).map((a) => <MenuItem key={a.id} value={a.id}>{a.title} · due {new Date(a.deadline).toLocaleDateString()}</MenuItem>)}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <ExportButton filename="late-work.csv" csv={csv} disabled={!d || d.rows.length === 0} />
      </Stack>
      {list.data?.length === 0 && <EmptyState compact icon={<AssignmentOutlinedIcon />} title="No assignment is past its deadline yet" />}
      {id && report.isLoading && <Skeleton variant="rounded" height={160} />}
      {report.isError && <ErrorState onRetry={() => report.refetch()} />}
      {d && (
        <>
          <Typography variant="body2" color="text.secondary">
            {d.rows.length} of {d.students} students solved something after the deadline; {d.neverSolved} never solved anything. An approved request moves that student&apos;s deadline later.
          </Typography>
          <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
            {d.rows.length === 0 ? <EmptyState compact title="Nobody solved anything late" /> : (
              <TableContainer>
                <Table size="small" aria-label="Late work">
                  <TableHead><TableRow sx={headRow}>
                    <TableCell>Student</TableCell><TableCell align="right">Late problems</TableCell><TableCell align="right">On time</TableCell><TableCell align="right">Hours late (first)</TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {d.rows.map((r) => (
                      <TableRow key={r.id} sx={{ "& td": { borderColor: "outlineVariant" } }}>
                        <TableCell><Typography variant="body2" fontWeight={500}>{r.name}</Typography>{r.rollNo && <Typography variant="caption" color="text.secondary">{r.rollNo}</Typography>}</TableCell>
                        <TableCell align="right">{r.lateProblems} / {r.totalProblems}</TableCell>
                        <TableCell align="right">{r.onTimeProblems}</TableCell>
                        <TableCell align="right">{r.hoursLate ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Card>
        </>
      )}
    </Stack>
  );
}

// ── Daily ────────────────────────────────────────────────────────────────────
function DailyTab() {
  const router = useRouter();
  const [date, setDate] = React.useState(todayIst());
  const q = useQuery<Daily>({ queryKey: ["reports", "daily", date], queryFn: () => get("/api/faculty/reports/daily", { date }), staleTime: 60_000 });
  const d = q.data;
  const csv = () => toCsv((d?.rows ?? []).map((r) => ({ name: r.name, roll_no: r.rollNo ?? "", section: r.section ?? "", submissions: r.submissions, accepted: r.accepted, problems_tried: r.problemsTried, solved_for_first_time: r.solvedForFirstTime, first_submission: r.firstAt, last_submission: r.lastAt })));
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
        <TextField type="date" size="small" label="Day" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Box sx={{ flex: 1 }} />
        <ExportButton filename={`daily-${date}.csv`} csv={csv} disabled={!d || d.rows.length === 0} />
      </Stack>
      {q.isError && <ErrorState onRetry={() => q.refetch()} />}
      {q.isLoading && <Skeleton variant="rounded" height={160} />}
      {d && (
        <>
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" } }}>
            <KpiTile icon={<GroupsOutlinedIcon />} label="Students" value={d.totals.students} />
            <KpiTile icon={<GroupsOutlinedIcon />} label="Active" value={d.totals.active} total={d.totals.students} accent="success" />
            <KpiTile icon={<CheckCircleOutlineIcon />} label="Submissions" value={d.totals.submissions} accent="secondary" />
            <KpiTile icon={<CheckCircleOutlineIcon />} label="Solved for the first time" value={d.totals.solvedForFirstTime} accent="tertiary" />
          </Box>
          <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
            {d.rows.length === 0 ? <EmptyState compact icon={<GroupsOutlinedIcon />} title="Nobody submitted on this day" /> : (
              <TableContainer>
                <Table size="small" aria-label="Daily activity">
                  <TableHead><TableRow sx={headRow}>
                    <TableCell>Student</TableCell><TableCell align="right">Submissions</TableCell><TableCell align="right">Accepted</TableCell>
                    <TableCell align="right">Problems tried</TableCell><TableCell align="right">New solves</TableCell><TableCell align="right">First</TableCell><TableCell align="right">Last</TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {d.rows.map((r) => (
                      <TableRow key={r.id} hover sx={bodyRow} onClick={() => router.push(`/faculty/students/${r.id}`)}>
                        <TableCell><Typography variant="body2" fontWeight={500}>{r.name}</Typography>{r.rollNo && <Typography variant="caption" color="text.secondary">{r.rollNo}</Typography>}</TableCell>
                        <TableCell align="right">{r.submissions}</TableCell><TableCell align="right">{r.accepted}</TableCell>
                        <TableCell align="right">{r.problemsTried}</TableCell><TableCell align="right">{r.solvedForFirstTime}</TableCell>
                        <TableCell align="right">{r.firstAt}</TableCell><TableCell align="right">{r.lastAt}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Card>
        </>
      )}
    </Stack>
  );
}

// ── Reopen requests ──────────────────────────────────────────────────────────
function DecisionDialog({ req, onClose, onDone }: { req: Reopen | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [days, setDays] = React.useState("3");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const decide = async (decision: "approve" | "decline") => {
    if (!req) return;
    setBusy(true); setError(null);
    try {
      await api.patch(`/api/faculty/reopen-requests/${req.id}`, { decision, note, ...(decision === "approve" ? { days: Number(days) } : {}) });
      toast(decision === "approve" ? "Approved. The student has more time." : "Declined.", { severity: "success" });
      onDone(); onClose();
    } catch (e) {
      setError(apiErrorMessage(e, "Could not save the decision."));
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!req} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{req?.studentName}: {req?.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Typography variant="body2"><strong>Their reason:</strong> {req?.reason}</Typography>
          <Typography variant="caption" color="text.secondary">The deadline was {fmt(req?.deadline ?? null)}. An approval gives this student, and only them, more time from now.</Typography>
          <TextField select size="small" label="How many more days" value={days} onChange={(e) => setDays(e.target.value)}>
            {[1, 2, 3, 5, 7, 10, 14].map((d) => <MenuItem key={d} value={String(d)}>{d} day{d === 1 ? "" : "s"}</MenuItem>)}
          </TextField>
          <TextField label="Note to the student (optional)" size="small" multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button color="error" onClick={() => decide("decline")} disabled={busy}>Decline</Button>
        <Button variant="contained" onClick={() => decide("approve")} disabled={busy}>Approve</Button>
      </DialogActions>
    </Dialog>
  );
}

function ReopenTab() {
  const qc = useQueryClient();
  const [status, setStatus] = React.useState<"pending" | "all">("pending");
  const [open, setOpen] = React.useState<Reopen | null>(null);
  const q = useQuery<Reopen[]>({ queryKey: ["reports", "reopen", status], queryFn: () => get("/api/faculty/reopen-requests", status === "pending" ? { status: "pending" } : {}) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["reports"] }); };
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1}>
        <Chip label="Waiting" color={status === "pending" ? "primary" : "default"} onClick={() => setStatus("pending")} />
        <Chip label="All requests" color={status === "all" ? "primary" : "default"} onClick={() => setStatus("all")} />
      </Stack>
      {q.isError && <ErrorState onRetry={() => q.refetch()} />}
      {q.isLoading && <Skeleton variant="rounded" height={160} />}
      {q.data && (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
          {q.data.length === 0 ? <EmptyState compact icon={<TimerOutlinedIcon />} title={status === "pending" ? "No requests waiting" : "No requests yet"} description="Students can ask for more time once a deadline has passed." /> : (
            <TableContainer>
              <Table size="small" aria-label="Reopen requests">
                <TableHead><TableRow sx={headRow}>
                  <TableCell>Student</TableCell><TableCell>For</TableCell><TableCell>Reason</TableCell><TableCell>Status</TableCell><TableCell align="right">Asked</TableCell><TableCell />
                </TableRow></TableHead>
                <TableBody>
                  {q.data.map((r) => (
                    <TableRow key={r.id} sx={{ "& td": { borderColor: "outlineVariant", verticalAlign: "top" } }}>
                      <TableCell><Typography variant="body2" fontWeight={500}>{r.studentName}</Typography>{r.rollNo && <Typography variant="caption" color="text.secondary">{r.rollNo}</Typography>}</TableCell>
                      <TableCell sx={{ maxWidth: 220 }}><Typography variant="body2" noWrap title={r.title}>{r.title}</Typography><Typography variant="caption" color="text.secondary">{r.targetType === "assignment" ? "Assignment" : "Course unit"} · due {fmt(r.deadline)}</Typography></TableCell>
                      <TableCell sx={{ maxWidth: 320 }}><Typography variant="body2">{r.reason}</Typography></TableCell>
                      <TableCell>
                        <Chip size="small" label={r.status === "pending" ? "Waiting" : r.status === "approved" ? `Approved until ${fmt(r.reopenUntil)}` : "Declined"}
                          sx={{ bgcolor: r.status === "approved" ? "successContainer" : r.status === "declined" ? "errorContainer" : "warningContainer", color: r.status === "approved" ? "onSuccessContainer" : r.status === "declined" ? "onErrorContainer" : "onWarningContainer", fontWeight: 600 }} />
                      </TableCell>
                      <TableCell align="right">{fmt(r.createdAt)}</TableCell>
                      <TableCell align="right">{r.status === "pending" && <Button size="small" variant="outlined" onClick={() => setOpen(r)}>Decide</Button>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Card>
      )}
      <DecisionDialog req={open} onClose={() => setOpen(null)} onDone={refresh} />
    </Stack>
  );
}

export default function ReportsPage() {
  const [tab, setTab] = React.useState<TabKey>("summary");
  return (
    <Box>
      <PageHeader title="Reports" subtitle="Summary, late work, daily activity and requests for more time, for your own students." />
      <Tabs value={tab} onChange={(_, v: TabKey) => setTab(v)} sx={{ mb: 3, borderBottom: "1px solid", borderColor: "outlineVariant" }}>
        <Tab value="summary" label="Summary" />
        <Tab value="late" label="Late work" />
        <Tab value="daily" label="Daily activity" />
        <Tab value="reopen" label="Requests for more time" />
      </Tabs>
      {tab === "summary" && <SummaryTab onGo={setTab} />}
      {tab === "late" && <LateTab />}
      {tab === "daily" && <DailyTab />}
      {tab === "reopen" && <ReopenTab />}
    </Box>
  );
}
