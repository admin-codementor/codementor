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
import { AddIcon, DeleteOutlineIcon, CloseIcon, ChevronLeftIcon, SaveOutlinedIcon, ListAltOutlinedIcon, BarChartOutlinedIcon, VisibilityOutlinedIcon, VisibilityOffOutlinedIcon, PsychologyOutlinedIcon } from "@/components/ui/icons";
import { ResponsiveBar } from "@nivo/bar";
import { useNivoTheme, useChartColors } from "@/components/ui/nivo";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
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
  author?: string | null;
  can_edit?: boolean;
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
      setError(apiErrorMessage(e2, "Couldn't create the test."));
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
  const nivoTheme = useNivoTheme();
  const chartColors = useChartColors();
  const [mode, setMode] = React.useState<"list" | "build" | "results">("list");
  const [tests, setTests] = React.useState<TestRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const router = useRouter();
  const showToast = useToast();
  const confirm = useConfirm();

  const flash = React.useCallback(
    (m: string, severity: "success" | "error" | "warning" = "error") => showToast(m, { severity }),
    [showToast],
  );

  const [loadError, setLoadError] = React.useState("");

  const load = React.useCallback(() => {
    setLoading(true);
    setLoadError("");
    api.get("/api/mcq/tests")
      .then((r) => { if (r.data?.success) setTests(r.data.data); })
      .catch((e) => setLoadError(apiErrorMessage(e, "Couldn't load your tests.")))
      .finally(() => setLoading(false));
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

  // `readOnly` reflects the API's can_edit: an HOD/admin can inspect a test from
  // another department but must not be offered a Save button for it.
  const [buildReadOnly, setBuildReadOnly] = React.useState(false);

  const openBuilder = async (id: string, readOnly = false) => {
    setMode("build");
    setBuildId(id);
    setBuildReadOnly(readOnly);
    setBuildLoading(true);
    setQuestions([]);
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
    } catch (e) {
      // Previously this threw silently and left an empty builder, which then
      // refused to save — indistinguishable from "MCQ tests don't work".
      flash(apiErrorMessage(e, "Couldn't open this test's questions."));
      setMode("list");
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
      flash(`Saved ${questions.length} question${questions.length === 1 ? "" : "s"}`, "success");
      load();
    } catch (e) {
      flash(apiErrorMessage(e, "Couldn't save the questions."));
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
    } catch (e) {
      flash(apiErrorMessage(e, "Couldn't load results."));
      setMode("list");
    }
  };

  const togglePublish = async (t: TestRow) => {
    try {
      await api.patch(`/api/mcq/tests/${t.id}/publish`, { is_published: !t.is_published });
      flash(t.is_published ? "Test unpublished" : "Test published to students", "success");
      load();
    } catch (e) {
      flash(apiErrorMessage(e, "Couldn't change the publish state."));
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
      flash("Test deleted", "success");
      load();
    } catch (e) {
      flash(apiErrorMessage(e, "Couldn't delete the test."));
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
          {buildReadOnly ? (
            <Chip label="Read-only — another department's test" size="small" sx={{ bgcolor: "surfaceContainerHigh", color: "onSurfaceVariant" }} />
          ) : (
            <Button variant="contained" color="success" startIcon={<SaveOutlinedIcon />} onClick={saveQuestions} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          )}
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
                <Box sx={{ height: Math.max(220, results.questionStats.length * 38) }}>
                  <ResponsiveBar
                    data={results.questionStats.map((q, i) => ({ q: `Q${i + 1}`, accuracy: q.accuracy }))}
                    keys={["accuracy"]}
                    indexBy="q"
                    layout="horizontal"
                    valueScale={{ type: "linear", min: 0, max: 100 }}
                    margin={{ top: 8, right: 16, bottom: 28, left: 48 }}
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

      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={load}>Retry</Button>}>
          {loadError}
        </Alert>
      )}

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
                  <Typography variant="caption" color="text.secondary">
                    {t.question_count} questions · {t.duration_minutes} min · {t.attempt_count} attempts
                    {t.author && t.author !== "You" ? ` · by ${t.author}` : ""}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
                  {/* Questions and Results are reads — available to HOD/admin across
                      departments. Publish and Delete are writes, so they're disabled
                      on tests outside the viewer's scope rather than 404-ing. */}
                  {/* Editable tests open the full authoring flow; read-only ones
                      (another department's) stay in the inline viewer. */}
                  {t.can_edit === false ? (
                    <Button size="small" variant="outlined" startIcon={<ListAltOutlinedIcon />} onClick={() => openBuilder(t.id, true)}>
                      View questions
                    </Button>
                  ) : (
                    <Button size="small" variant="outlined" startIcon={<ListAltOutlinedIcon />} onClick={() => router.push(`/faculty/mcq/${t.id}/edit`)}>
                      Questions
                    </Button>
                  )}
                  <Tooltip title={t.can_edit === false ? `Only ${t.author ?? "the author"}'s department can publish this` : ""}>
                    <span>
                      <Button size="small" variant="outlined" disabled={t.can_edit === false} startIcon={t.is_published ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />} onClick={() => togglePublish(t)}>
                        {t.is_published ? "Unpublish" : "Publish"}
                      </Button>
                    </span>
                  </Tooltip>
                  <Button size="small" variant="outlined" startIcon={<BarChartOutlinedIcon />} onClick={() => openResults(t)}>Results</Button>
                  <Tooltip title={t.can_edit === false ? "You can't delete another department's test" : "Delete test"}>
                    <span>
                      <IconButton size="small" color="error" disabled={t.can_edit === false} onClick={() => doDelete(t)} aria-label="Delete test"><DeleteOutlineIcon fontSize="small" /></IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <CreateTestDialog open={showCreate} onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); router.push(`/faculty/mcq/${id}/edit`); }} />
    </Box>
  );
}
