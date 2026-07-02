"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Alert from "@mui/material/Alert";
import Radio from "@mui/material/Radio";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
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
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CloseIcon from "@mui/icons-material/Close";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import ListAltOutlinedIcon from "@mui/icons-material/ListAltOutlined";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
import { BarChart } from "@mui/x-charts/BarChart";
import api from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/States";
import { useToast } from "@/components/feedback/ToastProvider";
import { useConfirm } from "@/components/feedback/ConfirmProvider";

interface TestRow {
  id: string;
  title: string;
  category: string;
  duration_minutes: number;
  is_published: boolean;
  question_count: number;
  attempt_count: number;
}
interface QForm {
  question_text: string;
  options: string[];
  correct_index: number;
  marks: number;
  topic: string;
  explanation: string;
}
interface ResultsData {
  summary: { attempts: number; avgScore: number; maxScore: number };
  questionStats: { accuracy: number }[];
  attempts: { userId: string; name: string; email: string; rollNo: string | null; department: string | null; section: string | null; score: number; total: number }[];
}

const CATS = ["aptitude", "technical", "verbal", "logical", "general"];
const blankQ = (): QForm => ({ question_text: "", options: ["", ""], correct_index: 0, marks: 1, topic: "", explanation: "" });

// ── Create Test dialog ────────────────────────────────────────────────────────
function CreateTestDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState("aptitude");
  const [duration, setDuration] = React.useState(30);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const r = await api.post("/api/mcq/tests", { title: title.trim(), category, duration_minutes: duration });
      if (r.data?.success) {
        onCreated(r.data.data.id);
        setTitle("");
        setCategory("aptitude");
        setDuration(30);
      }
    } catch (e2) {
      const err = e2 as { response?: { data?: { error?: string } } };
      setError(err?.response?.data?.error || "Failed to create test");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>New MCQ Test</DialogTitle>
      <Box component="form" onSubmit={submit}>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quantitative Aptitude — Set 1" size="small" fullWidth />
            <Stack direction="row" spacing={2}>
              <TextField select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} size="small" sx={{ flex: 1, textTransform: "capitalize" }}>
                {CATS.map((c) => <MenuItem key={c} value={c} sx={{ textTransform: "capitalize" }}>{c}</MenuItem>)}
              </TextField>
              <TextField label="Duration (min)" type="number" value={duration} onChange={(e) => setDuration(Math.max(1, parseInt(e.target.value) || 30))} size="small" sx={{ width: 130 }} />
            </Stack>
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" color="success" disabled={saving}>{saving ? "Creating…" : "Create & add questions"}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export default function FacultyMcqPage() {
  const [mode, setMode] = React.useState<"list" | "build" | "results">("list");
  const [tests, setTests] = React.useState<TestRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const showToast = useToast();
  const confirm = useConfirm();

  const flash = React.useCallback(
    (m: string, severity: "success" | "error" | "warning" = "error") => showToast(m, { severity }),
    [showToast],
  );

  const load = React.useCallback(() => {
    setLoading(true);
    api.get("/api/mcq/tests").then((r) => { if (r.data?.success) setTests(r.data.data); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Builder state
  const [buildId, setBuildId] = React.useState<string | null>(null);
  const [buildTitle, setBuildTitle] = React.useState("");
  const [questions, setQuestions] = React.useState<QForm[]>([]);
  const [buildLoading, setBuildLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const openBuilder = async (id: string) => {
    setMode("build");
    setBuildId(id);
    setBuildLoading(true);
    try {
      const r = await api.get(`/api/mcq/tests/${id}`);
      if (r.data?.success) {
        setBuildTitle(r.data.data.test.title);
        const qs: QForm[] = r.data.data.questions.map((q: { question_text: string; options: string[]; correct_index: number; marks: number; topic?: string; explanation?: string }) => ({
          question_text: q.question_text,
          options: q.options,
          correct_index: q.correct_index,
          marks: q.marks,
          topic: q.topic || "",
          explanation: q.explanation || "",
        }));
        setQuestions(qs.length ? qs : [blankQ()]);
      }
    } finally {
      setBuildLoading(false);
    }
  };

  const saveQuestions = async () => {
    for (const [i, q] of questions.entries()) {
      if (!q.question_text.trim()) return flash(`Q${i + 1}: question text required`, "warning");
      if (q.options.length < 2 || q.options.some((o) => !o.trim())) return flash(`Q${i + 1}: fill all options`, "warning");
    }
    setSaving(true);
    try {
      await api.put(`/api/mcq/tests/${buildId}/questions`, { questions });
      flash("Questions saved", "success");
      load();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      flash(err?.response?.data?.error || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // Results state
  const [results, setResults] = React.useState<ResultsData | null>(null);
  const [resTitle, setResTitle] = React.useState("");
  const openResults = async (t: TestRow) => {
    setMode("results");
    setResults(null);
    setResTitle(t.title);
    try {
      const r = await api.get(`/api/mcq/tests/${t.id}/results`);
      if (r.data?.success) setResults(r.data.data);
    } catch {
      /* ignore */
    }
  };

  const togglePublish = async (t: TestRow) => {
    try {
      await api.patch(`/api/mcq/tests/${t.id}/publish`, { is_published: !t.is_published });
      load();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      flash(err?.response?.data?.error || "Failed");
    }
  };
  const doDelete = async (t: TestRow) => {
    const ok = await confirm({
      title: "Delete test?",
      description: `Delete "${t.title}"? This removes all its questions and attempts.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/mcq/tests/${t.id}`);
      load();
    } catch {
      flash("Delete failed");
    }
  };

  const setQ = (qi: number, patch: Partial<QForm>) => setQuestions((qs) => qs.map((x, i) => (i === qi ? { ...x, ...patch } : x)));

  // ── BUILD MODE ──
  if (mode === "build") {
    return (
      <Box>
        <Button startIcon={<ChevronLeftIcon />} onClick={() => { setMode("list"); load(); }} sx={{ mb: 2 }}>Back to tests</Button>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <ListAltOutlinedIcon sx={{ color: "primary.main" }} />
            <Typography variant="h5" fontWeight={600}>{buildTitle}</Typography>
          </Stack>
          <Button variant="contained" color="success" startIcon={<SaveOutlinedIcon />} onClick={saveQuestions} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </Stack>

        {buildLoading ? (
          <Stack spacing={2}>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} variant="rounded" height={160} />)}</Stack>
        ) : (
          <Stack spacing={2}>
            {questions.map((q, qi) => (
              <Card key={qi} variant="outlined" sx={{ borderColor: "outlineVariant" }}>
                <CardContent>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                    <Typography variant="caption" fontWeight={700} color="primary.main">Question {qi + 1}</Typography>
                    <IconButton size="small" color="error" onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qi))} aria-label="Delete question"><DeleteOutlineIcon fontSize="small" /></IconButton>
                  </Stack>
                  <TextField value={q.question_text} onChange={(e) => setQ(qi, { question_text: e.target.value })} placeholder="Question text" size="small" fullWidth multiline rows={2} sx={{ mb: 1.5 }} />
                  <Stack spacing={1}>
                    {q.options.map((opt, oi) => (
                      <Stack key={oi} direction="row" spacing={1} alignItems="center">
                        <Radio size="small" checked={q.correct_index === oi} onChange={() => setQ(qi, { correct_index: oi })} color="success" title="Mark as correct" />
                        <TextField value={opt} onChange={(e) => setQ(qi, { options: q.options.map((o, j) => (j === oi ? e.target.value : o)) })} placeholder={`Option ${String.fromCharCode(65 + oi)}`} size="small" fullWidth />
                        {q.options.length > 2 && (
                          <IconButton size="small" onClick={() => setQ(qi, { options: q.options.filter((_, j) => j !== oi), correct_index: Math.min(q.correct_index, q.options.length - 2) })} aria-label="Remove option"><CloseIcon fontSize="small" /></IconButton>
                        )}
                      </Stack>
                    ))}
                  </Stack>
                  <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
                    {q.options.length < 6 && (
                      <Button size="small" onClick={() => setQ(qi, { options: [...q.options, ""] })}>+ option</Button>
                    )}
                    <TextField value={q.topic} onChange={(e) => setQ(qi, { topic: e.target.value })} placeholder="Topic (optional)" size="small" sx={{ width: 180 }} />
                    <TextField label="Marks" type="number" value={q.marks} onChange={(e) => setQ(qi, { marks: Math.max(1, parseInt(e.target.value) || 1) })} size="small" sx={{ width: 90 }} />
                  </Stack>
                  <TextField value={q.explanation} onChange={(e) => setQ(qi, { explanation: e.target.value })} placeholder="Explanation shown after submit (optional)" size="small" fullWidth sx={{ mt: 1.5 }} />
                </CardContent>
              </Card>
            ))}
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setQuestions((qs) => [...qs, blankQ()])} sx={{ borderStyle: "dashed" }}>Add question</Button>
          </Stack>
        )}
      </Box>
    );
  }

  // ── RESULTS MODE ──
  if (mode === "results") {
    return (
      <Box>
        <Button startIcon={<ChevronLeftIcon />} onClick={() => setMode("list")} sx={{ mb: 2 }}>Back to tests</Button>
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
              <StatCard icon={<PsychologyOutlinedIcon />} label="Submissions" value={results.summary.attempts} accent="primary" />
              <StatCard icon={<BarChartOutlinedIcon />} label="Avg score" value={results.summary.avgScore} accent="tertiary" />
              <StatCard icon={<BarChartOutlinedIcon />} label="Top score" value={results.summary.maxScore} accent="success" />
            </Box>

            <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>Per-question accuracy</Typography>
                <BarChart
                  height={Math.max(200, results.questionStats.length * 36)}
                  layout="horizontal"
                  xAxis={[{ min: 0, max: 100 }]}
                  yAxis={[{ scaleType: "band", data: results.questionStats.map((_, i) => `Q${i + 1}`) }]}
                  series={[{ data: results.questionStats.map((q) => q.accuracy), label: "Accuracy %" }]}
                  margin={{ top: 10, bottom: 24, left: 48, right: 10 }}
                />
              </CardContent>
            </Card>

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
        title="Aptitude & MCQ Tests"
        subtitle="Create timed MCQ/aptitude tests, publish them to students, and review results."
        actions={<Button variant="contained" color="success" startIcon={<AddIcon />} onClick={() => setShowCreate(true)}>New Test</Button>}
      />

      {loading ? (
        <Stack spacing={2}>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} variant="rounded" height={80} />)}</Stack>
      ) : tests.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState icon={<PsychologyOutlinedIcon />} title="No tests yet" description="Create your first MCQ/aptitude test." />
        </Card>
      ) : (
        <Stack spacing={1.5}>
          {tests.map((t) => (
            <Card key={t.id} variant="outlined" sx={{ borderColor: "outlineVariant" }}>
              <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", "&:last-child": { pb: 2 } }}>
                <Box sx={{ flex: 1, minWidth: 200 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="body2" fontWeight={500}>{t.title}</Typography>
                    <Chip label={t.category} size="small" sx={{ height: 18, fontSize: 10, textTransform: "uppercase", bgcolor: "surfaceContainerHigh", color: "onSurfaceVariant" }} />
                    <Chip
                      label={t.is_published ? "Published" : "Draft"}
                      size="small"
                      sx={{ height: 18, fontSize: 10, fontWeight: 600, bgcolor: t.is_published ? "successContainer" : "surfaceContainerHigh", color: t.is_published ? "onSuccessContainer" : "onSurfaceVariant" }}
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">{t.question_count} questions · {t.duration_minutes} min · {t.attempt_count} attempts</Typography>
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button size="small" variant="outlined" startIcon={<ListAltOutlinedIcon />} onClick={() => openBuilder(t.id)}>Questions</Button>
                  <Button size="small" variant="outlined" startIcon={t.is_published ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />} onClick={() => togglePublish(t)}>
                    {t.is_published ? "Unpublish" : "Publish"}
                  </Button>
                  <Button size="small" variant="outlined" startIcon={<BarChartOutlinedIcon />} onClick={() => openResults(t)}>Results</Button>
                  <IconButton size="small" color="error" onClick={() => doDelete(t)} aria-label="Delete test"><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <CreateTestDialog open={showCreate} onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); load(); openBuilder(id); }} />
    </Box>
  );
}
