"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Chip from "@mui/material/Chip";
import Avatar from "@mui/material/Avatar";
import Skeleton from "@mui/material/Skeleton";
import LinearProgress from "@mui/material/LinearProgress";
import Divider from "@mui/material/Divider";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import Alert from "@mui/material/Alert";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { CheckCircleIcon, RadioButtonUncheckedIcon, CloseIcon, PeopleOutlineIcon, BoltOutlinedIcon, TrackChangesOutlinedIcon, DescriptionOutlinedIcon, DownloadOutlinedIcon, AddIcon, ShieldOutlinedIcon, EditOutlinedIcon } from "@/components/ui/icons";
import { Reveal } from "@/components/ui/motion";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { SearchField } from "@/components/ui/SearchField";
import { EmptyState } from "@/components/ui/States";
import { useToast } from "@/components/feedback/ToastProvider";

// ── Types ───────────────────────────────────────────────────────────────────
interface Stats {
  totalStudents: number;
  activeStudents: number;
  problemsSolved: number;
  totalSubs: number;
  acRate: number;
}
interface Student {
  id: string;
  name: string;
  email: string;
  joinedDate: string;
  department?: string | null;
  section?: string | null;
  year?: number | null;
  rollNo?: string | null;
  totalSubmissions: number;
  acceptedSubmissions: number;
  problemsSolved: number;
  acRate: number;
}
interface AssignmentItem {
  id: string;
  title: string;
  deadline: string;
}
interface AtRiskStudent {
  id: string;
  name: string;
  email: string;
  department?: string | null;
  section?: string | null;
  reasons: string[];
}
interface ProgressData {
  problems: { id: string; title: string; difficulty: string }[];
  progress: {
    student: { id: string; name: string; email: string };
    solved: number;
    total: number;
    problems: { id: string; title: string; solved: boolean }[];
  }[];
}

type Tab = "overview" | "students" | "assignments";

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}
function daysLeft(deadline: string) {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
}
// `<input type="datetime-local">` only accepts `YYYY-MM-DDTHH:mm` in *local* time,
// so an ISO/UTC string has to be shifted before it can prefill the field.
function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// `onError` is passed in because this lives outside a component and so can't call
// useToast itself. A failed export used to be completely silent.
async function downloadBlob(url: string, filename: string, onError?: (message: string) => void) {
  try {
    const res = await api.get(url, { responseType: "blob" });
    const objUrl = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objUrl);
  } catch (e) {
    onError?.(apiErrorMessage(e, "Export failed."));
  }
}

// ── Create / Edit Assignment modal ────────────────────────────────────────────
// This dialog previously posted `problem_ids: []` unconditionally with no way to
// pick problems, so every assignment students received was empty. Selection order
// is preserved because it becomes the order students see.
interface PickableProblem {
  id: string;
  title: string;
  difficulty: string;
  tags: string[];
}

function AssignmentDialog({
  open,
  editingId,
  onClose,
  onSaved,
}: {
  open: boolean;
  editingId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [deadline, setDeadline] = React.useState("");
  const [isExam, setIsExam] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState("");
  const [problems, setProblems] = React.useState<PickableProblem[]>([]);
  const [problemsLoading, setProblemsLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const showToast = useToast();

  // Load the pickable catalogue, and the assignment itself when editing.
  React.useEffect(() => {
    if (!open) return;
    setError("");
    setSearch("");
    setProblemsLoading(true);

    api
      .get("/api/faculty/problems")
      .then((r) => { if (r.data?.success) setProblems(r.data.data); })
      .catch((e) => setError(apiErrorMessage(e, "Couldn't load your problems.")))
      .finally(() => setProblemsLoading(false));

    if (editingId) {
      api
        .get(`/api/faculty/assignments/${editingId}`)
        .then((r) => {
          if (!r.data?.success) return;
          const a = r.data.data;
          setTitle(a.title);
          // datetime-local wants `YYYY-MM-DDTHH:mm` in local time.
          setDeadline(a.deadline ? toLocalInputValue(a.deadline) : "");
          setIsExam(!!a.is_exam);
          setSelected((a.problems ?? []).map((p: { id: string }) => p.id));
        })
        .catch((e) => setError(apiErrorMessage(e, "Couldn't load this assignment.")));
    } else {
      setTitle("");
      setDeadline("");
      setIsExam(false);
      setSelected([]);
    }
  }, [open, editingId]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const visible = problems.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.title.toLowerCase().includes(q) || (p.tags ?? []).some((t) => t.toLowerCase().includes(q));
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !deadline) {
      setError("Title and deadline are required.");
      return;
    }
    if (selected.length === 0) {
      setError("Pick at least one problem — students can't do anything with an empty assignment.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        title: title.trim(),
        deadline: new Date(deadline).toISOString(),
        problem_ids: selected,
        allowed_cidrs: [],
        is_exam: isExam,
      };
      if (editingId) await api.put(`/api/faculty/assignments/${editingId}`, payload);
      else await api.post("/api/faculty/assignments", payload);

      showToast(
        `${editingId ? "Assignment updated" : "Assignment created"} — ${selected.length} problem${selected.length === 1 ? "" : "s"}`,
        { severity: "success" },
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't save the assignment."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{editingId ? "Edit Assignment" : "New Assignment"}</DialogTitle>
      <Box component="form" onSubmit={submit}>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth size="small" placeholder="Midterm Lab — Arrays & Strings" />
              <TextField label="Deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} size="small" sx={{ minWidth: 230 }} slotProps={{ inputLabel: { shrink: true } }} />
            </Stack>

            <FormControlLabel
              control={<Checkbox checked={isExam} onChange={(e) => setIsExam(e.target.checked)} />}
              label={
                <Box>
                  <Typography variant="body2" fontWeight={500}>Proctored exam</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Enforces fullscreen, tab-switch detection &amp; keystroke logging. Also disables the AI tutor for the duration.
                  </Typography>
                </Box>
              }
            />

            <Divider />

            {/* Problem picker */}
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} flexWrap="wrap" useFlexGap>
              <Typography variant="overline" color="text.secondary">
                Problems{selected.length > 0 ? ` · ${selected.length} selected` : ""}
              </Typography>
              <SearchField value={search} onChange={setSearch} placeholder="Search by title or tag" />
            </Stack>

            {selected.length > 0 && (
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                {selected.map((id, i) => {
                  const p = problems.find((x) => x.id === id);
                  return (
                    <Chip
                      key={id}
                      size="small"
                      label={`${i + 1}. ${p?.title ?? id}`}
                      onDelete={() => toggle(id)}
                      sx={{ maxWidth: 260 }}
                    />
                  );
                })}
              </Stack>
            )}

            <Box sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: 2, maxHeight: 300, overflowY: "auto" }}>
              {problemsLoading ? (
                <Stack spacing={1} sx={{ p: 1.5 }}>
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={36} />)}
                </Stack>
              ) : visible.length === 0 ? (
                <EmptyState
                  icon={<DescriptionOutlinedIcon />}
                  title={problems.length === 0 ? "No problems yet" : "No problems match that search"}
                  description={problems.length === 0 ? "Create a problem first, then attach it here." : undefined}
                />
              ) : (
                visible.map((p) => {
                  const checked = selected.includes(p.id);
                  const order = selected.indexOf(p.id);
                  return (
                    <Stack
                      key={p.id}
                      direction="row"
                      alignItems="center"
                      spacing={1}
                      onClick={() => toggle(p.id)}
                      sx={{
                        px: 1, py: 0.75, cursor: "pointer", borderBottom: "1px solid", borderColor: "outlineVariant",
                        "&:last-of-type": { borderBottom: 0 },
                        bgcolor: checked ? "primaryContainer" : "transparent",
                      }}
                    >
                      <Checkbox size="small" checked={checked} tabIndex={-1} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" noWrap>
                          {checked ? `${order + 1}. ` : ""}{p.title}
                        </Typography>
                        {(p.tags ?? []).length > 0 && (
                          <Typography variant="caption" color="text.secondary" noWrap>{p.tags.slice(0, 4).join(" · ")}</Typography>
                        )}
                      </Box>
                      <Chip
                        label={p.difficulty}
                        size="small"
                        sx={{ height: 18, fontSize: 10, textTransform: "capitalize", flexShrink: 0 }}
                      />
                    </Stack>
                  );
                })
              )}
            </Box>

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" color="success" disabled={saving}>
            {saving ? "Saving…" : editingId ? "Save Assignment" : "Create Assignment"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

// ── Create Contest modal ──────────────────────────────────────────────────────
function CreateContestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = React.useState("");
  const [description, setDesc] = React.useState("");
  const [startsAt, setStartsAt] = React.useState("");
  const [endsAt, setEndsAt] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startsAt || !endsAt) {
      setError("Title, start and end time are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post("/api/contests", {
        title: title.trim(),
        description: description.trim() || undefined,
        starts_at: startsAt,
        ends_at: endsAt,
        scoreboard_mode: "public",
        problem_ids: [],
      });
      onClose();
      setTitle("");
      setDesc("");
      setStartsAt("");
      setEndsAt("");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't create the contest."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New Contest</DialogTitle>
      <Box component="form" onSubmit={submit}>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth size="small" placeholder="Weekly Contest #1" />
            <TextField label="Description (optional)" value={description} onChange={(e) => setDesc(e.target.value)} fullWidth size="small" multiline rows={2} />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField label="Starts at" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} fullWidth size="small" slotProps={{ inputLabel: { shrink: true } }} />
              <TextField label="Ends at" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} fullWidth size="small" slotProps={{ inputLabel: { shrink: true } }} />
            </Stack>
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" color="success" disabled={saving}>
            {saving ? "Creating…" : "Create Contest"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

// ── Student detail modal ──────────────────────────────────────────────────────
function StudentDialog({ student, onClose }: { student: Student | null; onClose: () => void }) {
  const acPct = student && student.totalSubmissions > 0 ? Math.round((student.acceptedSubmissions / student.totalSubmissions) * 100) : 0;
  return (
    <Dialog open={student != null} onClose={onClose} fullWidth maxWidth="xs">
      {student && (
        <>
          <DialogTitle sx={{ pr: 6 }}>
            {student.name}
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{student.email}</Typography>
            <IconButton onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }} aria-label="Close"><CloseIcon /></IconButton>
          </DialogTitle>
          <DialogContent dividers>
            <Box sx={{ textAlign: "center", mb: 2 }}>
              <Typography variant="h3" fontWeight={700} sx={{ fontFamily: "ui-monospace, monospace", color: acPct >= 60 ? "success.main" : acPct >= 30 ? "warning.main" : "error.main" }}>
                {acPct}%
              </Typography>
              <Typography variant="caption" color="text.secondary">Acceptance rate</Typography>
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5 }}>
              {[
                { label: "Solved", value: student.problemsSolved },
                { label: "Submissions", value: student.totalSubmissions },
                { label: "Accepted", value: student.acceptedSubmissions },
              ].map((s) => (
                <Card key={s.label} variant="outlined" sx={{ p: 1.5, textAlign: "center", borderColor: "outlineVariant" }}>
                  <Typography variant="h6" fontWeight={700} sx={{ fontFamily: "ui-monospace, monospace" }}>{s.value}</Typography>
                  <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                </Card>
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", mt: 2 }}>
              Joined {new Date(student.joinedDate).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
            </Typography>
          </DialogContent>
        </>
      )}
    </Dialog>
  );
}

// ── Progress modal ────────────────────────────────────────────────────────────
function ProgressDialog({ target, onClose }: { target: { id: string; title: string } | null; onClose: () => void }) {
  const [data, setData] = React.useState<ProgressData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [error, setError] = React.useState("");
  const showToast = useToast();

  React.useEffect(() => {
    if (!target) return;
    setLoading(true);
    setData(null);
    setError("");
    api
      .get(`/api/faculty/assignments/${target.id}/progress`)
      .then((r) => {
        if (r.data?.success) setData(r.data.data);
      })
      .catch((e) => setError(apiErrorMessage(e, "Couldn't load progress data.")))
      .finally(() => setLoading(false));
  }, [target]);

  const filtered = (data?.progress ?? []).filter(
    (p) => p.student.name.toLowerCase().includes(search.toLowerCase()) || p.student.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Dialog open={target != null} onClose={onClose} fullWidth maxWidth="lg">
      {target && (
        <>
          <DialogTitle sx={{ pr: 6 }}>
            {target.title}
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Student progress</Typography>
            <IconButton onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }} aria-label="Close"><CloseIcon /></IconButton>
          </DialogTitle>
          <DialogContent dividers>
            {loading ? (
              <Stack spacing={1}>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={40} />)}</Stack>
            ) : error ? (
              <Alert severity="error">{error}</Alert>
            ) : !data ? (
              <EmptyState title="No progress data for this assignment yet" />
            ) : (
              <>
                <SearchField value={search} onChange={setSearch} placeholder="Filter students…" label="Filter students" sx={{ mb: 2, maxWidth: 320 }} />
                <TableContainer sx={{ maxHeight: 480 }}>
                  <Table size="small" stickyHeader aria-label="Assignment progress">
                    <TableHead>
                      <TableRow sx={{ "& th": { fontWeight: 600, bgcolor: "surfaceContainer" } }}>
                        <TableCell>Student</TableCell>
                        <TableCell sx={{ width: 160 }}>Progress</TableCell>
                        {data.problems.map((p) => (
                          <TableCell key={p.id} align="center" sx={{ maxWidth: 80 }}>
                            <Typography variant="caption" noWrap sx={{ display: "block", maxWidth: 72 }} title={p.title}>{p.title}</Typography>
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filtered.map((row) => {
                        const pct = row.total > 0 ? Math.round((row.solved / row.total) * 100) : 0;
                        return (
                          <TableRow key={row.student.id} hover>
                            <TableCell>
                              <Typography variant="body2" fontWeight={500}>{row.student.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{row.student.email}</Typography>
                            </TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={1} alignItems="center">
                                <LinearProgress variant="determinate" value={pct} sx={{ flex: 1, height: 6, borderRadius: 3 }} />
                                <Typography variant="caption" sx={{ fontFamily: "ui-monospace, monospace" }}>{row.solved}/{row.total}</Typography>
                              </Stack>
                            </TableCell>
                            {row.problems.map((p) => (
                              <TableCell key={p.id} align="center">
                                {p.solved ? <CheckCircleIcon sx={{ fontSize: 18, color: "success.main" }} /> : <RadioButtonUncheckedIcon sx={{ fontSize: 18, color: "outline" }} />}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                      {filtered.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={2 + data.problems.length} align="center" sx={{ py: 4, color: "text.secondary" }}>No students found</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button startIcon={<DownloadOutlinedIcon />} onClick={() => downloadBlob(`/api/faculty/assignments/${target.id}/export`, "marks_export.csv", (m) => showToast(m, { severity: "error" }))}>
              Export CSV
            </Button>
            <Button onClick={onClose}>Close</Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

// ── Proctor report modal ──────────────────────────────────────────────────────
interface ProctorRow {
  user_id: string;
  name: string;
  email: string;
  rollNo: string | null;
  tabSwitches: number;
  fullscreenExits: number;
  pastes: number;
  risk: "low" | "medium" | "high";
}
function ProctorDialog({ target, onClose }: { target: { id: string; title: string } | null; onClose: () => void }) {
  const [rows, setRows] = React.useState<ProctorRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    if (!target) return;
    setLoading(true);
    setRows([]);
    setError("");
    api
      .get(`/api/proctor/assignment/${target.id}`)
      .then((r) => {
        if (r.data?.success) setRows(r.data.data);
      })
      .catch((e) => setError(apiErrorMessage(e, "Couldn't load the proctoring report.")))
      .finally(() => setLoading(false));
  }, [target]);
  const riskColor = (r: string) => (r === "high" ? "error.main" : r === "medium" ? "warning.main" : "success.main");
  return (
    <Dialog open={target != null} onClose={onClose} fullWidth maxWidth="md">
      {target && (
        <>
          <DialogTitle sx={{ pr: 6 }}>
            Proctoring Report
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>{target.title}</Typography>
            <IconButton onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }} aria-label="Close"><CloseIcon /></IconButton>
          </DialogTitle>
          <DialogContent dividers>
            {loading ? (
              <Stack spacing={1}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={40} />)}</Stack>
            ) : error ? (
              <Alert severity="error">{error}</Alert>
            ) : rows.length === 0 ? (
              <EmptyState icon={<ShieldOutlinedIcon />} title="No proctoring events recorded yet" />
            ) : (
              <TableContainer>
                <Table size="small" aria-label="Proctoring report">
                  <TableHead>
                    <TableRow sx={{ "& th": { fontWeight: 600 } }}>
                      <TableCell>Student</TableCell>
                      <TableCell align="center">Tab</TableCell>
                      <TableCell align="center">FS exits</TableCell>
                      <TableCell align="center">Pastes</TableCell>
                      <TableCell align="right">Risk</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.user_id}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>{r.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{r.rollNo ? `${r.rollNo} · ` : ""}{r.email}</Typography>
                        </TableCell>
                        <TableCell align="center" sx={{ fontFamily: "ui-monospace, monospace" }}>{r.tabSwitches}</TableCell>
                        <TableCell align="center" sx={{ fontFamily: "ui-monospace, monospace" }}>{r.fullscreenExits}</TableCell>
                        <TableCell align="center" sx={{ fontFamily: "ui-monospace, monospace" }}>{r.pastes}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, textTransform: "uppercase", color: riskColor(r.risk) }}>{r.risk}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DialogContent>
        </>
      )}
    </Dialog>
  );
}

function SectionCard({ title, icon, action, children }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          {icon}
          <Typography variant="subtitle2" fontWeight={600}>{title}</Typography>
          {action && <Box sx={{ ml: "auto" }}>{action}</Box>}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FacultyDashboardPage() {
  const [tab, setTab] = React.useState<Tab>("overview");
  const [stats, setStats] = React.useState<Stats>({ totalStudents: 0, activeStudents: 0, problemsSolved: 0, totalSubs: 0, acRate: 0 });
  const [assignments, setAssignments] = React.useState<AssignmentItem[]>([]);
  const [atRisk, setAtRisk] = React.useState<AtRiskStudent[]>([]);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [studentsLoading, setStudentsLoading] = React.useState(false);
  const [studentSearch, setStudentSearch] = React.useState("");

  const [selectedStudent, setSelectedStudent] = React.useState<Student | null>(null);
  const [progressTarget, setProgressTarget] = React.useState<{ id: string; title: string } | null>(null);
  const [proctorTarget, setProctorTarget] = React.useState<{ id: string; title: string } | null>(null);
  const [assignmentDialog, setAssignmentDialog] = React.useState<{ open: boolean; editingId: string | null }>({ open: false, editingId: null });
  const [showCreateContest, setShowCreateContest] = React.useState(false);

  const [loadError, setLoadError] = React.useState("");
  const router = useRouter();
  const showToast = useToast();

  const loadDashboard = React.useCallback(() => {
    setLoadError("");
    api
      .get("/api/faculty/dashboard")
      .then((r) => {
        if (r.data?.success) {
          setStats(r.data.data.stats ?? r.data.data);
          setAssignments(r.data.data.assignments ?? []);
        }
      })
      .catch((e) => setLoadError(apiErrorMessage(e, "Couldn't load the dashboard.")))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    loadDashboard();
    // At-risk is supplementary — a failure here shouldn't take over the page, but
    // it must not vanish silently either.
    api.get("/api/faculty/at-risk")
      .then((r) => { if (r.data?.success) setAtRisk(r.data.data); })
      .catch((e) => showToast(apiErrorMessage(e, "Couldn't load at-risk students."), { severity: "warning" }));
  }, [loadDashboard, showToast]);

  const loadStudents = React.useCallback(() => {
    if (students.length) return;
    setStudentsLoading(true);
    api.get("/api/faculty/students")
      .then((r) => { if (r.data?.success) setStudents(r.data.data); })
      .catch((e) => showToast(apiErrorMessage(e, "Couldn't load students."), { severity: "error" }))
      .finally(() => setStudentsLoading(false));
  }, [students.length, showToast]);

  React.useEffect(() => {
    if (tab === "students") loadStudents();
  }, [tab, loadStudents]);

  const filteredStudents = students.filter(
    (s) => s.name.toLowerCase().includes(studentSearch.toLowerCase()) || s.email.toLowerCase().includes(studentSearch.toLowerCase()),
  );

  return (
    <Box>
      <PageHeader
        title="Faculty Dashboard"
        subtitle="Monitor student performance and class engagement."
        actions={
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" size="small" startIcon={<DownloadOutlinedIcon />} onClick={() => downloadBlob("/api/pdf/class-report", "class_report.pdf", (m) => showToast(m, { severity: "error" }))}>
              Class Report
            </Button>
            <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={() => setShowCreateContest(true)}>
              New Contest
            </Button>
          </Stack>
        }
      />

      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={loadDashboard}>Retry</Button>}>
          {loadError}
        </Alert>
      )}

      {/* Stat cards */}
      <Reveal>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", xl: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}>
          <StatCard icon={<PeopleOutlineIcon />} label="Total Students" value={loading ? "—" : stats.totalStudents} accent="primary" />
          <StatCard icon={<BoltOutlinedIcon />} label="Active (7d)" value={loading ? "—" : stats.activeStudents} accent="success" />
          <StatCard icon={<TrackChangesOutlinedIcon />} label="Class AC Rate" value={loading ? "—" : `${stats.acRate}%`} accent="tertiary" />
          <StatCard icon={<DescriptionOutlinedIcon />} label="Total Submissions" value={loading ? "—" : stats.totalSubs} accent="warning" />
        </Box>
      </Reveal>

      <Tabs value={tab} onChange={(_, v: Tab) => setTab(v)} sx={{ mb: 3, borderBottom: "1px solid", borderColor: "outlineVariant" }}>
        <Tab value="overview" label="Overview" />
        <Tab value="students" label="Students" />
        <Tab value="assignments" label="Assignments" />
      </Tabs>

      {/* Overview */}
      {tab === "overview" && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 3 }}>
          <SectionCard title="Quick Summary">
            <Stack divider={<Divider sx={{ borderColor: "outlineVariant" }} />}>
              {[
                { label: "Problems solved class-wide", value: stats.problemsSolved },
                { label: "Active students this week", value: `${stats.activeStudents} / ${stats.totalStudents}` },
                { label: "Class acceptance rate", value: `${stats.acRate}%` },
                { label: "Total submissions", value: stats.totalSubs },
              ].map((row) => (
                <Stack key={row.label} direction="row" justifyContent="space-between" sx={{ py: 1.25 }}>
                  <Typography variant="body2" color="text.secondary">{row.label}</Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ fontFamily: "ui-monospace, monospace" }}>{loading ? "—" : row.value}</Typography>
                </Stack>
              ))}
            </Stack>
          </SectionCard>

          <SectionCard title="Upcoming Deadlines">
            {assignments.length === 0 ? (
              <EmptyState title="No assignments created yet" />
            ) : (
              <Stack divider={<Divider sx={{ borderColor: "outlineVariant" }} />}>
                {assignments.slice(0, 5).map((a) => {
                  const d = daysLeft(a.deadline);
                  return (
                    <Stack key={a.id} direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 1.25 }}>
                      <Typography variant="body2" noWrap sx={{ pr: 2 }}>{a.title}</Typography>
                      <Typography variant="caption" fontWeight={500} sx={{ whiteSpace: "nowrap", color: d < 0 ? "error.main" : d <= 2 ? "warning.main" : "text.secondary" }}>
                        {d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Today" : `${d}d left`}
                      </Typography>
                    </Stack>
                  );
                })}
              </Stack>
            )}
          </SectionCard>

          <Box sx={{ gridColumn: { xl: "1 / -1" } }}>
            <SectionCard
              title="At-Risk Students"
              icon={<ShieldOutlinedIcon sx={{ color: "error.main", fontSize: 20 }} />}
              action={atRisk.length > 0 ? <Chip label={atRisk.length} size="small" sx={{ bgcolor: "errorContainer", color: "onErrorContainer", fontWeight: 700 }} /> : undefined}
            >
              {atRisk.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>No students currently flagged. 🎉</Typography>
              ) : (
                <Stack spacing={1} sx={{ maxHeight: 300, overflowY: "auto" }}>
                  {atRisk.slice(0, 12).map((s) => (
                    <Stack key={s.id} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1, borderRadius: 2, border: "1px solid", borderColor: "outlineVariant" }}>
                      <Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: "errorContainer", color: "onErrorContainer" }}>{initials(s.name)}</Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={500} noWrap>{s.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>{s.email}</Typography>
                      </Box>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" justifyContent="flex-end">
                        {s.reasons.map((reason) => (
                          <Chip key={reason} label={reason} size="small" sx={{ height: 20, fontSize: 10, bgcolor: "warningContainer", color: "onWarningContainer" }} />
                        ))}
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              )}
            </SectionCard>
          </Box>
        </Box>
      )}

      {/* Students */}
      {tab === "students" && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} alignItems="center">
            <SearchField value={studentSearch} onChange={setStudentSearch} placeholder="Search students…" label="Search students" sx={{ flex: 1, maxWidth: 360 }} />
            <Typography variant="caption" color="text.secondary">{filteredStudents.length} students</Typography>
          </Stack>
          <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table aria-label="Students" sx={{ minWidth: 640 }}>
                <TableHead>
                  <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600, borderColor: "outlineVariant" } }}>
                    <TableCell>Student</TableCell>
                    <TableCell align="right">Solved</TableCell>
                    <TableCell align="right">Submissions</TableCell>
                    <TableCell align="right">AC Rate</TableCell>
                    <TableCell align="right">Joined</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {studentsLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>
                    ))
                  ) : filteredStudents.length === 0 ? (
                    <TableRow><TableCell colSpan={5} sx={{ border: 0 }}><EmptyState icon={<PeopleOutlineIcon />} title={studentSearch ? "No matching students" : "No students enrolled yet"} /></TableCell></TableRow>
                  ) : (
                    filteredStudents.map((s) => (
                      <TableRow key={s.id} hover onClick={() => setSelectedStudent(s)} sx={{ cursor: "pointer", "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                        <TableCell>
                          <Stack direction="row" spacing={1.5} alignItems="center">
                            <Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: "primaryContainer", color: "onPrimaryContainer" }}>{initials(s.name)}</Avatar>
                            <Box>
                              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                <Typography variant="body2" fontWeight={500}>{s.name}</Typography>
                                {(s.department || s.section) && (
                                  <Chip size="small" label={[s.department, s.section && `Sec ${s.section}`, s.year && `Y${s.year}`].filter(Boolean).join(" · ")} sx={{ height: 18, fontSize: 10, bgcolor: "surfaceContainerHigh", color: "onSurfaceVariant" }} />
                                )}
                              </Stack>
                              <Typography variant="caption" color="text.secondary">{s.rollNo ? `${s.rollNo} · ` : ""}{s.email}</Typography>
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: "ui-monospace, monospace", color: "success.main" }}>{s.problemsSolved}</TableCell>
                        <TableCell align="right" sx={{ fontFamily: "ui-monospace, monospace" }}>{s.totalSubmissions}</TableCell>
                        <TableCell align="right" sx={{ fontFamily: "ui-monospace, monospace", color: s.acRate >= 60 ? "success.main" : s.acRate >= 30 ? "warning.main" : "error.main" }}>{s.acRate}%</TableCell>
                        <TableCell align="right" sx={{ color: "text.secondary" }}>{new Date(s.joinedDate).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Stack>
      )}

      {/* Assignments */}
      {tab === "assignments" && (
        <Stack spacing={2}>
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={() => setAssignmentDialog({ open: true, editingId: null })}>Quick add</Button>
            <Button variant="contained" color="success" size="small" startIcon={<AddIcon />} onClick={() => router.push("/faculty/assignments/new/edit")}>New Assignment</Button>
          </Box>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} variant="rounded" height={64} />)
          ) : assignments.length === 0 ? (
            <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}><EmptyState icon={<DescriptionOutlinedIcon />} title="No assignments yet" description="Create an assignment to get started." /></Card>
          ) : (
            assignments.map((a) => {
              const d = daysLeft(a.deadline);
              return (
                <Card key={a.id} variant="outlined" sx={{ borderColor: "outlineVariant" }}>
                  <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", "&:last-child": { pb: 2 } }}>
                    <Box sx={{ flex: 1, minWidth: 200 }}>
                      <Typography variant="body2" fontWeight={500} noWrap>{a.title}</Typography>
                      <Typography variant="caption" sx={{ color: d < 0 ? "error.main" : d <= 2 ? "warning.main" : "text.secondary" }}>
                        Due {new Date(a.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}{d < 0 ? " · Overdue" : ""}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => router.push(`/faculty/assignments/${a.id}/edit`)}>Edit</Button>
                      <Button size="small" variant="outlined" startIcon={<PeopleOutlineIcon />} onClick={() => setProgressTarget({ id: a.id, title: a.title })}>Progress</Button>
                      <Button size="small" variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={() => downloadBlob(`/api/faculty/assignments/${a.id}/export`, "marks_export.csv", (m) => showToast(m, { severity: "error" }))}>Export</Button>
                      <Button size="small" variant="outlined" color="warning" startIcon={<ShieldOutlinedIcon />} onClick={() => setProctorTarget({ id: a.id, title: a.title })}>Proctor</Button>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })
          )}
        </Stack>
      )}

      {/* Modals */}
      <StudentDialog student={selectedStudent} onClose={() => setSelectedStudent(null)} />
      <ProgressDialog target={progressTarget} onClose={() => setProgressTarget(null)} />
      <ProctorDialog target={proctorTarget} onClose={() => setProctorTarget(null)} />
      <AssignmentDialog
        open={assignmentDialog.open}
        editingId={assignmentDialog.editingId}
        onClose={() => setAssignmentDialog({ open: false, editingId: null })}
        onSaved={loadDashboard}
      />
      <CreateContestDialog open={showCreateContest} onClose={() => setShowCreateContest(false)} />
    </Box>
  );
}
