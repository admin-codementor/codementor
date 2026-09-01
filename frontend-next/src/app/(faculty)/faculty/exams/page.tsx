"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Skeleton from "@mui/material/Skeleton";
import Alert from "@mui/material/Alert";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import {
  AddIcon, DeleteOutlineIcon, ChevronLeftIcon, BarChartOutlinedIcon,
  AssignmentOutlinedIcon, EditOutlinedIcon, TimerOutlinedIcon,
} from "@/components/ui/icons";
import { ResponsiveBar } from "@nivo/bar";
import { useNivoTheme, useChartColors } from "@/components/ui/nivo";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/States";
import { useToast } from "@/components/feedback/ToastProvider";
import { useConfirm } from "@/components/feedback/ConfirmProvider";

interface ExamRow {
  id: string;
  title: string;
  is_published: boolean;
  window_start: string;
  window_end: string;
  duration_minutes: number;
  section_count: number;
  attempt_count: number;
  author?: string | null;
  can_edit?: boolean;
}
interface SectionResultStat { id: string; title: string; type: "mcq" | "coding"; question_stats?: { accuracy: number }[]; attempted?: number; passed?: number; problem_count?: number }
interface ResultsData {
  summary: { attempts: number; avgScore: number; maxScore: number };
  sections: SectionResultStat[];
  attempts: { userId: string; name: string; email: string; rollNo: string | null; department: string | null; section: string | null; score: number; total: number }[];
}

// datetime-local needs `YYYY-MM-DDTHH:mm` in local time.
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── New Exam dialog ──────────────────────────────────────────────────────────
function CreateExamDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const now = React.useMemo(() => new Date(), []);
  const [title, setTitle] = React.useState("");
  const [windowStart, setWindowStart] = React.useState(() => toLocalInput(now));
  const [windowEnd, setWindowEnd] = React.useState(() => toLocalInput(new Date(now.getTime() + 24 * 3600_000)));
  const [duration, setDuration] = React.useState(60);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError("");
    try {
      const r = await api.post("/api/exams", {
        title: title.trim(),
        window_start: new Date(windowStart).toISOString(),
        window_end: new Date(windowEnd).toISOString(),
        duration_minutes: duration,
      });
      if (r.data?.success) onCreated(r.data.data.id);
    } catch (e2) {
      setError(apiErrorMessage(e2, "Couldn't create the exam."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>New Exam</DialogTitle>
      <Box component="form" onSubmit={submit}>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Semester Assessment — Set 1" size="small" fullWidth autoFocus />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField label="Opens" type="datetime-local" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} size="small" fullWidth slotProps={{ inputLabel: { shrink: true } }} />
              <TextField label="Closes" type="datetime-local" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} size="small" fullWidth slotProps={{ inputLabel: { shrink: true } }} />
            </Stack>
            <TextField label="Duration once started (minutes)" type="number" value={duration} onChange={(e) => setDuration(Math.max(1, parseInt(e.target.value) || 60))} size="small" sx={{ width: 220 }} />
            <Typography variant="caption" color="text.secondary">
              You can add sections, target classes, and set instructions after creating it.
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" color="success" disabled={saving}>{saving ? "Creating…" : "Create & add sections"}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export default function FacultyExamsPage() {
  const nivoTheme = useNivoTheme();
  const chartColors = useChartColors();
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();

  const [mode, setMode] = React.useState<"list" | "results">("list");
  const [exams, setExams] = React.useState<ExamRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);

  const flash = React.useCallback(
    (m: string, severity: "success" | "error" | "warning" = "error") => showToast(m, { severity }),
    [showToast],
  );

  const load = React.useCallback(() => {
    setLoading(true);
    setLoadError("");
    api.get("/api/exams")
      .then((r) => { if (r.data?.success) setExams(r.data.data); })
      .catch((e) => setLoadError(apiErrorMessage(e, "Couldn't load your exams.")))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // ── Results ──────────────────────────────────────────────────────────────
  const [results, setResults] = React.useState<ResultsData | null>(null);
  const [resTitle, setResTitle] = React.useState("");
  const openResults = async (e: ExamRow) => {
    setMode("results");
    setResults(null);
    setResTitle(e.title);
    try {
      const r = await api.get(`/api/exams/${e.id}/results`);
      if (r.data?.success) setResults(r.data.data);
    } catch (err) {
      flash(apiErrorMessage(err, "Couldn't load results."));
      setMode("list");
    }
  };

  const doDelete = async (e: ExamRow) => {
    const ok = await confirm({
      title: "Delete exam?",
      description: `Delete "${e.title}"? This removes all its sections, questions and attempts.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/exams/${e.id}`);
      flash("Exam deleted", "success");
      load();
    } catch (err) {
      flash(apiErrorMessage(err, "Couldn't delete the exam."));
    }
  };

  const togglePublish = async (e: ExamRow) => {
    try {
      const r = await api.patch(`/api/exams/${e.id}/publish`, { is_published: !e.is_published });
      flash(r.data?.data?.is_published ? "Published to students" : "Unpublished", "success");
      load();
    } catch (err) {
      flash(apiErrorMessage(err, "Couldn't change the publish state."));
    }
  };

  // ── RESULTS MODE ──
  if (mode === "results") {
    const mcqStats = (results?.sections ?? []).filter((s): s is SectionResultStat & { question_stats: { accuracy: number }[] } => s.type === "mcq")
      .flatMap((s) => s.question_stats.map((q, i) => ({ label: `${s.title} Q${i + 1}`, accuracy: q.accuracy })));
    return (
      <Box>
        <Button startIcon={<ChevronLeftIcon />} onClick={() => setMode("list")} sx={{ mb: 2 }}>Back to exams</Button>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 3 }}>
          <BarChartOutlinedIcon sx={{ color: "primary.main" }} />
          <Typography variant="h5" fontWeight={600}>Results — {resTitle}</Typography>
        </Stack>

        {!results ? (
          <Stack spacing={2}>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} variant="rounded" height={80} />)}</Stack>
        ) : results.attempts.length === 0 ? (
          <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}><EmptyState icon={<BarChartOutlinedIcon />} title="No submissions yet" /></Card>
        ) : (
          <Stack spacing={3}>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
              <StatCard icon={<AssignmentOutlinedIcon />} label="Submissions" value={results.summary.attempts} accent="primary" />
              <StatCard icon={<BarChartOutlinedIcon />} label="Avg score" value={results.summary.avgScore} accent="tertiary" />
              <StatCard icon={<BarChartOutlinedIcon />} label="Top score" value={results.summary.maxScore} accent="success" />
            </Box>

            <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>Section breakdown</Typography>
                <Stack spacing={0.5}>
                  {results.sections.map((s) => (
                    <Stack key={s.id} direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" sx={{ minWidth: 160 }}>{s.title}</Typography>
                      <Chip size="small" label={s.type} sx={{ height: 18, fontSize: 10, textTransform: "uppercase" }} />
                      {s.type === "coding" && (
                        <Typography variant="caption" color="text.secondary">
                          {s.attempted ?? 0} attempted · {s.passed ?? 0} accepted (of {s.problem_count ?? 0} problem{(s.problem_count ?? 0) === 1 ? "" : "s"})
                        </Typography>
                      )}
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>

            {mcqStats.length > 0 && (
              <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
                <CardContent>
                  <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>Per-question accuracy (MCQ sections)</Typography>
                  <Box sx={{ height: Math.max(220, mcqStats.length * 30) }}>
                    <ResponsiveBar
                      data={mcqStats.map((q) => ({ q: q.label, accuracy: q.accuracy }))}
                      keys={["accuracy"]}
                      indexBy="q"
                      layout="horizontal"
                      valueScale={{ type: "linear", min: 0, max: 100 }}
                      margin={{ top: 8, right: 16, bottom: 28, left: 120 }}
                      padding={0.3}
                      borderRadius={5}
                      colors={[chartColors[0]]}
                      theme={nivoTheme}
                      enableLabel={false}
                      axisBottom={{ tickSize: 0, tickPadding: 8 }}
                      axisLeft={{ tickSize: 0, tickPadding: 8 }}
                    />
                  </Box>
                </CardContent>
              </Card>
            )}

            <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
              <TableContainer sx={{ overflowX: "auto" }}>
                <Table aria-label="Attempts" sx={{ minWidth: 480 }}>
                  <TableHead>
                    <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600, borderColor: "outlineVariant" } }}>
                      <TableCell>Student</TableCell>
                      <TableCell>Dept/Sec</TableCell>
                      <TableCell align="right">Score</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {results.attempts.map((a) => (
                      <TableRow key={a.userId} sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                        <TableCell>
                          <Typography variant="body2">{a.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{a.rollNo || a.email}</Typography>
                        </TableCell>
                        <TableCell sx={{ color: "text.secondary" }}>{[a.department, a.section].filter(Boolean).join(" / ") || "—"}</TableCell>
                        <TableCell align="right" sx={{ fontFamily: "ui-monospace, monospace" }}>{a.score}/{a.total}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          </Stack>
        )}
      </Box>
    );
  }

  // ── LIST MODE ──
  return (
    <Box>
      <PageHeader
        title="Exams"
        subtitle="Build multi-section timed exams — MCQ and coding sections in one assessment — and review results."
        actions={<Button variant="contained" color="success" startIcon={<AddIcon />} onClick={() => setShowCreate(true)}>New Exam</Button>}
      />

      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={load}>Retry</Button>}>
          {loadError}
        </Alert>
      )}

      {loading ? (
        <Stack spacing={2}>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} variant="rounded" height={80} />)}</Stack>
      ) : exams.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState icon={<AssignmentOutlinedIcon />} title="No exams yet" description="Create your first multi-section exam." />
        </Card>
      ) : (
        <Stack spacing={1.5}>
          {exams.map((e) => (
            <Card key={e.id} variant="outlined" sx={{ borderColor: "outlineVariant" }}>
              <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", "&:last-child": { pb: 2 } }}>
                <Box sx={{ flex: 1, minWidth: 200 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="body2" fontWeight={500}>{e.title}</Typography>
                    <Chip
                      label={e.is_published ? "Published" : "Draft"}
                      size="small"
                      sx={{ height: 18, fontSize: 10, fontWeight: 600, bgcolor: e.is_published ? "successContainer" : "surfaceContainerHigh", color: e.is_published ? "onSuccessContainer" : "onSurfaceVariant" }}
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {e.section_count} section{e.section_count === 1 ? "" : "s"} · {e.duration_minutes} min · {e.attempt_count} attempt{e.attempt_count === 1 ? "" : "s"}
                    {e.author && e.author !== "You" ? ` · by ${e.author}` : ""}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    <TimerOutlinedIcon sx={{ fontSize: 12, verticalAlign: "text-bottom", mr: 0.5 }} />
                    {new Date(e.window_start).toLocaleString()} → {new Date(e.window_end).toLocaleString()}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
                  <Tooltip title={e.can_edit === false ? `Only ${e.author ?? "the author"}'s department can edit this` : ""}>
                    <span>
                      <Button size="small" variant="outlined" disabled={e.can_edit === false} startIcon={<EditOutlinedIcon />} onClick={() => router.push(`/faculty/exams/${e.id}/edit`)}>
                        Edit
                      </Button>
                    </span>
                  </Tooltip>
                  <Tooltip title={e.can_edit === false ? `Only ${e.author ?? "the author"}'s department can publish this` : ""}>
                    <span>
                      <Button size="small" variant="outlined" disabled={e.can_edit === false} onClick={() => togglePublish(e)}>
                        {e.is_published ? "Unpublish" : "Publish"}
                      </Button>
                    </span>
                  </Tooltip>
                  <Button size="small" variant="outlined" startIcon={<BarChartOutlinedIcon />} onClick={() => openResults(e)}>Results</Button>
                  <Tooltip title={e.can_edit === false ? "You can't delete another department's exam" : "Delete exam"}>
                    <span>
                      <IconButton size="small" color="error" disabled={e.can_edit === false} onClick={() => doDelete(e)} aria-label="Delete exam"><DeleteOutlineIcon fontSize="small" /></IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <CreateExamDialog open={showCreate} onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); router.push(`/faculty/exams/${id}/edit`); }} />
    </Box>
  );
}
