"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import FormControlLabel from "@mui/material/FormControlLabel";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { CancelIcon, CheckCircleIcon, ChevronLeftIcon, ChevronRightIcon, DeleteOutlineIcon, FlagOutlinedIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { clearExamSession, examHeaders, examStopCode, setExamSession, type ExamStopCode } from "@/lib/examSession";
import { useToast } from "@/components/feedback/ToastProvider";
import { useExamTimer } from "@/hooks/useExamTimer";
import { useExamProctor } from "@/hooks/useExamProctor";
import { useExamSaver } from "@/hooks/useExamSaver";
import { useExamPrefs } from "@/hooks/useExamPrefs";
import { ExamHeader, ExamNotice, ExamPalette, SaveIndicator, type PaletteSection } from "@/components/student/exam/ExamChrome";
import { FinishDialog, InstructionsDialog, SettingsDialog, type SectionTally } from "@/components/student/exam/ExamDialogs";
import { CompletedPanel, LockedScreen, ReplacedScreen } from "@/components/student/exam/ExamScreens";
import type { QuestionStatus } from "@/components/student/exam/QuestionNavigator";
import { PageHeader } from "@/components/ui/PageHeader";

interface InstrSection {
  id: string; title: string; type: "mcq" | "coding"; order: number; instructions: string | null;
  question_count: number; marks_per_question: number; negative_marking: number | null;
  total_marks: number; duration_minutes: number | null;
}
interface InstructionsData {
  exam: { id: string; title: string; description: string | null; general_instructions: string | null; window_start: string; window_end: string; duration_minutes: number; violation_limit?: number };
  sections: InstrSection[];
}

interface AttemptQuestion {
  id: string; question_text: string; options: string[]; marks: number; topic: string | null; position: number;
  correct_index?: number; explanation?: string | null;
}
interface AttemptProblem { id: string; title: string; difficulty: string | null }
interface AttemptSection {
  id: string; title: string; type: "mcq" | "coding"; order: number; instructions: string | null;
  marks_per_question: number; questions?: AttemptQuestion[]; problems?: AttemptProblem[];
}
interface QState { status: QuestionStatus; selectedIndex: number | null; sectionId: string }
interface CState { status: QuestionStatus; sectionId: string; score?: number; verdict?: string }
interface AttemptView {
  exam: { id: string; title: string; duration_minutes: number; general_instructions?: string | null };
  sections: AttemptSection[];
  question_state: Record<string, QState>;
  coding_state: Record<string, CState>;
  seconds_remaining: number | null;
  submitted: boolean;
  submitted_at?: string | null;
  auto_submitted?: boolean;
  score: number | null;
  total: number | null;
  locked?: { reason: string; count: number | null } | null;
  violation_count?: number;
  violation_limit?: number;
  server_time?: string;
  session_id?: string;
}

type ViewState = "loading" | "error" | "instructions" | "taking" | "result" | "replaced" | "locked";
interface Item { sectionId: string; itemId: string; type: "mcq" | "coding" }

function errStatus(e: unknown): number | undefined {
  return (e as { response?: { status?: number } })?.response?.status;
}

const clockTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : null);

export default function StudentExamPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up("md"));
  const id = params.id;

  const [view, setView] = React.useState<ViewState>("loading");
  const [errorMsg, setErrorMsg] = React.useState("");
  const [instructions, setInstructions] = React.useState<InstructionsData | null>(null);
  const [ackInstructions, setAckInstructions] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [attempt, setAttempt] = React.useState<AttemptView | null>(null);
  const [current, setCurrent] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [checking, setChecking] = React.useState(false);

  const [finishOpen, setFinishOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [infoOpen, setInfoOpen] = React.useState(false);
  const [panelOpen, setPanelOpen] = React.useState(true);
  React.useEffect(() => { setPanelOpen(wide); }, [wide]);

  const { prefs, update: updatePrefs, reset: resetPrefs } = useExamPrefs();
  const visitedSent = React.useRef<Set<string>>(new Set());

  const adopt = React.useCallback((data: AttemptView) => {
    if (data.session_id) setExamSession(id, data.session_id);
    setAttempt(data);
  }, [id]);

  // Claim the exam for this tab: it becomes the one that may write (a window that held it earlier is told on its next save).
  const claim = React.useCallback(async (): Promise<AttemptView | null> => {
    const r = await api.post(`/api/exams/${id}/start`, {});
    if (!r.data?.success) return null;
    const data: AttemptView = r.data.data;
    adopt(data);
    return data;
  }, [id, adopt]);

  // ── First load: resume an existing attempt, or show the instructions ──
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await api.get(`/api/exams/${id}/attempt`);
        if (!alive || !r.data?.success) return;
        const data: AttemptView = r.data.data;
        if (data.submitted) { setAttempt(data); setView("result"); return; }
        if (data.locked) { setAttempt(data); setView("locked"); return; }
        // A running attempt with no session in this tab (a new tab, a new device): this tab takes it over.
        const fresh = examHeaders(id) ? data : (await claim()) ?? data;
        if (!alive) return;
        setAttempt(fresh);
        setView("taking");
      } catch (e) {
        if (!alive) return;
        if (errStatus(e) === 404) {
          api.get(`/api/exams/${id}/instructions`)
            .then((r2) => {
              if (!alive) return;
              if (r2.data?.success) { setInstructions(r2.data.data); setView("instructions"); }
              else { setErrorMsg("Couldn't load this exam."); setView("error"); }
            })
            .catch((e2) => { if (alive) { setErrorMsg(apiErrorMessage(e2, "Couldn't load this exam.")); setView("error"); } });
        } else {
          setErrorMsg(apiErrorMessage(e, "Couldn't load this exam."));
          setView("error");
        }
      }
    })();
    return () => { alive = false; };
  }, [id, claim]);

  const startExam = async () => {
    // Must fire synchronously, inside the click handler and before any await, to count as a user gesture: browsers refuse
    // requestFullscreen() once it is called after a network round trip.
    document.documentElement.requestFullscreen?.().catch(() => {});
    setStarting(true);
    try {
      const data = await claim();
      if (data) { setCurrent(0); setView("taking"); }
    } catch (e) {
      toast(apiErrorMessage(e, "Couldn't start the exam."), { severity: "error" });
    } finally {
      setStarting(false);
    }
  };

  const refreshState = React.useCallback(async (): Promise<AttemptView | null> => {
    const r = await api.get(`/api/exams/${id}/attempt`);
    if (!r.data?.success) return null;
    const data: AttemptView = r.data.data;
    setAttempt((prev) => ({ ...(prev ?? data), ...data }));
    return data;
  }, [id]);

  const showResult = React.useCallback(async () => {
    try {
      const data = await refreshState();
      if (data) setView("result");
    } catch (e) {
      toast(apiErrorMessage(e, "Submitted, but couldn't load your result. Reload to see it."), { severity: "error" });
    }
  }, [refreshState, toast]);

  // The server refused further changes from this tab: say why, in plain words, instead of failing quietly.
  const onStop = React.useCallback((code: ExamStopCode) => {
    if (code === "SESSION_REPLACED") setView("replaced");
    else if (code === "EXAM_LOCKED") setView("locked");
    else if (code === "SESSION_REQUIRED") { void claim().catch(() => setView("replaced")); }
    else void showResult(); // TIME_UP or ALREADY_SUBMITTED
  }, [claim, showResult]);

  const saver = useExamSaver({ examId: id, enabled: view === "taking", onStop });

  const doSubmit = React.useCallback(async () => {
    setSubmitting(true);
    try {
      await saver.flush();
      await api.post(`/api/exams/${id}/submit`, {}, { headers: examHeaders(id) });
    } catch (e) {
      const code = examStopCode(e);
      if (code === "SESSION_REPLACED") { setSubmitting(false); setFinishOpen(false); setView("replaced"); return; }
      if (code === "EXAM_LOCKED") { setSubmitting(false); setFinishOpen(false); setView("locked"); return; }
      if (!code && errStatus(e) !== 409) {
        // A network failure: the answers are safe on the server and on this device. Do not pretend the exam was submitted.
        toast(apiErrorMessage(e, "Couldn't submit yet. Your answers are saved. Check your connection and press Finish again."), { severity: "error" });
        setSubmitting(false);
        return;
      }
      // TIME_UP / ALREADY_SUBMITTED fall through: the state read below gives the authoritative result.
    }
    await showResult();
    setSubmitting(false);
    setFinishOpen(false);
  }, [id, saver, showResult, toast]);

  const timer = useExamTimer({
    initialSeconds: attempt?.seconds_remaining ?? 0,
    active: view === "taking" && !!attempt && !attempt.submitted,
    onExpire: doSubmit,
    seedKey: attempt?.server_time ?? null,
  });

  // The whole exam is monitored, not only the coding section. Leaving fullscreen or switching tab is recorded and counted by the server;
  // past the exam's limit the attempt is paused for staff. Nothing here ends the exam: only the server deadline does.
  const proctor = useExamProctor({
    active: view === "taking", examId: id,
    onLocked: () => { void refreshState().catch(() => {}).finally(() => setView("locked")); },
  });

  // ── what is on screen ──
  const items: Item[] = React.useMemo(() => {
    if (!attempt) return [];
    return attempt.sections.flatMap((s): Item[] => (s.type === "coding"
      ? (s.problems ?? []).map((p): Item => ({ sectionId: s.id, itemId: p.id, type: "coding" }))
      : (s.questions ?? []).map((q): Item => ({ sectionId: s.id, itemId: q.id, type: "mcq" }))));
  }, [attempt]);
  const idx = Math.min(Math.max(current, 0), Math.max(items.length - 1, 0));
  const item = items[idx];
  const section = attempt?.sections.find((s) => s.id === item?.sectionId);
  const sectionNumber = attempt && section ? attempt.sections.indexOf(section) + 1 : 1;
  const itemInSection = section && item ? items.filter((it) => it.sectionId === section.id).findIndex((it) => it.itemId === item.itemId) + 1 : 1;
  const itemsInSection = section ? items.filter((it) => it.sectionId === section.id).length : 0;

  const stateOf = React.useCallback((it: Item): QuestionStatus => (
    (it.type === "mcq" ? attempt?.question_state[it.itemId]?.status : attempt?.coding_state[it.itemId]?.status) ?? "not_visited"
  ), [attempt]);

  const paletteSections: PaletteSection[] = React.useMemo(() => {
    if (!attempt) return [];
    return attempt.sections.map((s) => ({ id: s.id, title: s.title, type: s.type, items: items.filter((it) => it.sectionId === s.id).map((it) => ({ id: it.itemId, status: stateOf(it) })) }));
  }, [attempt, items, stateOf]);

  const tallies: SectionTally[] = React.useMemo(() => paletteSections.map((s) => {
    let answered = 0, notAnswered = 0, notVisited = 0;
    for (const it of s.items) { if (it.status === "answered" || it.status === "answered_marked") answered += 1; else if (it.status === "not_visited") notVisited += 1; else notAnswered += 1; }
    return { id: s.id, title: s.title, total: s.items.length, answered, notAnswered, notVisited };
  }), [paletteSections]);

  // Landing on a question counts as visiting it.
  React.useEffect(() => {
    if (view !== "taking" || !attempt || !item || item.type !== "mcq") return;
    if (attempt.question_state[item.itemId] || visitedSent.current.has(item.itemId)) return;
    visitedSent.current.add(item.itemId);
    setAttempt((prev) => prev && ({ ...prev, question_state: { ...prev.question_state, [item.itemId]: { status: "visited", selectedIndex: null, sectionId: item.sectionId } } }));
    saver.save({ questionId: item.itemId, sectionId: item.sectionId, selectedIndex: null, marked: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, item?.itemId]);

  const setLocal = (questionId: string, sectionId: string, status: QuestionStatus, selectedIndex: number | null) =>
    setAttempt((prev) => prev && ({ ...prev, question_state: { ...prev.question_state, [questionId]: { status, selectedIndex, sectionId } } }));

  const choose = (sectionId: string, questionId: string, selectedIndex: number) => {
    const prev = attempt?.question_state[questionId];
    const marked = prev?.status === "marked" || prev?.status === "answered_marked";
    setLocal(questionId, sectionId, marked ? "answered_marked" : "answered", selectedIndex);
    saver.save({ questionId, sectionId, selectedIndex, marked });
  };

  const clearAnswer = (sectionId: string, questionId: string) => {
    const prev = attempt?.question_state[questionId];
    const marked = prev?.status === "marked" || prev?.status === "answered_marked";
    setLocal(questionId, sectionId, marked ? "marked" : "visited", null);
    saver.save({ questionId, sectionId, selectedIndex: null, marked });
  };

  const toggleMark = (sectionId: string, questionId: string) => {
    const prev = attempt?.question_state[questionId];
    const hasAnswer = prev != null && Number.isInteger(prev.selectedIndex);
    const nowMarked = !(prev?.status === "marked" || prev?.status === "answered_marked");
    const status: QuestionStatus = hasAnswer ? (nowMarked ? "answered_marked" : "answered") : (nowMarked ? "marked" : "visited");
    const selectedIndex = hasAnswer ? prev!.selectedIndex : null;
    setLocal(questionId, sectionId, status, selectedIndex);
    saver.save({ questionId, sectionId, selectedIndex, marked: nowMarked });
  };

  // Coding problems open in the full code editor (decision D2), carrying the exam and this tab's session.
  const solveProblem = async (sectionId: string, problemId: string) => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    try {
      await api.patch(`/api/exams/${id}/attempt/visit/${problemId}`, { section_id: sectionId }, { headers: examHeaders(id) });
      setAttempt((prev) => {
        if (!prev) return prev;
        if (prev.coding_state[problemId]?.status === "answered") return prev;
        return { ...prev, coding_state: { ...prev.coding_state, [problemId]: { status: "visited", sectionId } } };
      });
    } catch (e) {
      const code = examStopCode(e);
      if (code) { onStop(code); return; }
      // Any other failure is non-blocking: still let the student through to the problem.
    }
    router.push(`/app/problems/${problemId}?exam=${id}&section=${sectionId}`);
  };

  const jumpTo = (sectionId: string, itemId: string) => {
    const i = items.findIndex((it) => it.sectionId === sectionId && it.itemId === itemId);
    if (i >= 0) { setCurrent(i); if (!wide) setPanelOpen(false); }
  };

  // Keyboard: arrows move between questions, 1 to 4 choose an option (when no dialog is open).
  React.useEffect(() => {
    if (view !== "taking") return;
    const onKey = (e: KeyboardEvent) => {
      if (finishOpen || settingsOpen || infoOpen) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") setCurrent((c) => Math.min(c + 1, Math.max(items.length - 1, 0)));
      else if (e.key === "ArrowLeft") setCurrent((c) => Math.max(c - 1, 0));
      else if (/^[1-9]$/.test(e.key) && item?.type === "mcq" && section) {
        const q = section.questions?.find((x) => x.id === item.itemId);
        const n = Number(e.key) - 1;
        if (q && n < q.options.length) choose(section.id, q.id, n);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, finishOpen, settingsOpen, infoOpen, items.length, item?.itemId, attempt]);

  // ── paused: wait for staff, then carry on by itself ──
  const checkResumed = React.useCallback(async () => {
    setChecking(true);
    try {
      const data = await refreshState();
      if (!data) return;
      if (data.submitted) { setView("result"); return; }
      if (!data.locked) {
        const fresh = await claim();
        if (fresh) setView("taking");
      }
    } catch { /* still paused, or offline: try again on the next check */ } finally {
      setChecking(false);
    }
  }, [refreshState, claim]);

  React.useEffect(() => {
    if (view !== "locked") return;
    const t = setInterval(() => { void checkResumed(); }, 8000);
    return () => clearInterval(t);
  }, [view, checkResumed]);

  const takeBack = async () => {
    setChecking(true);
    try {
      const fresh = await claim();
      if (fresh) { visitedSent.current.clear(); setView("taking"); }
    } catch (e) {
      toast(apiErrorMessage(e, "Couldn't switch to this window."), { severity: "error" });
    } finally {
      setChecking(false);
    }
  };

  // ── screens ──
  if (view === "loading") {
    return <Stack spacing={2} sx={{ p: 3 }}><Skeleton variant="rounded" height={40} width="40%" /><Skeleton variant="rounded" height={320} /></Stack>;
  }
  if (view === "error") {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => router.push("/app/exams")}>Back</Button>}>{errorMsg}</Alert>
      </Box>
    );
  }
  if (view === "replaced") return <ReplacedScreen busy={checking} onTakeBack={takeBack} onLeave={() => { clearExamSession(id); router.push("/app/exams"); }} />;
  if (view === "locked") return <LockedScreen count={attempt?.violation_count ?? null} checking={checking} onCheck={checkResumed} />;

  // ── instructions ──
  if (view === "instructions" && instructions) {
    const limit = instructions.exam.violation_limit;
    return (
      <Box sx={{ maxWidth: 720, mx: "auto", p: { xs: 2, sm: 3, md: 4 } }}>
        <PageHeader
          title={instructions.exam.title}
          subtitle={instructions.exam.description ?? undefined}
          actions={<Button startIcon={<ChevronLeftIcon />} onClick={() => router.push("/app/exams")}>Back to exams</Button>}
        />
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", mt: 2 }}>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>General instructions</Typography>
            {instructions.exam.general_instructions ? (
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{instructions.exam.general_instructions}</Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">Read each section carefully. Your answers save automatically as you go.</Typography>
            )}
            <Divider sx={{ my: 2 }} />
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Section</TableCell>
                  <TableCell align="right">Questions</TableCell>
                  <TableCell align="right">Marks each</TableCell>
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {instructions.sections.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.title} <Chip size="small" label={s.type} sx={{ ml: 1, height: 16, fontSize: 9, textTransform: "uppercase" }} /></TableCell>
                    <TableCell align="right">{s.question_count}</TableCell>
                    <TableCell align="right">{s.marks_per_question}</TableCell>
                    <TableCell align="right">{s.total_marks}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Typography variant="body2" sx={{ mt: 2 }}>
              Once started you get <strong>{instructions.exam.duration_minutes} minutes</strong>. The window is open{" "}
              {new Date(instructions.exam.window_start).toLocaleString()} → {new Date(instructions.exam.window_end).toLocaleString()}.
            </Typography>
            <Alert severity="info" sx={{ mt: 2 }}>
              The exam runs in fullscreen. Your answers save automatically, even if your connection drops for a while.
              {limit ? ` If you leave fullscreen or switch tabs ${limit} times, your exam is paused until your faculty resumes you. Nothing ends your exam early.` : ""}
            </Alert>
          </CardContent>
        </Card>
        <FormControlLabel
          sx={{ mt: 2 }}
          control={<Checkbox checked={ackInstructions} onChange={(e) => setAckInstructions(e.target.checked)} />}
          label="I have read the instructions"
        />
        <Button fullWidth variant="contained" size="large" sx={{ mt: 1 }} disabled={!ackInstructions || starting} onClick={startExam}>
          {starting ? "Starting…" : "Start Exam"}
        </Button>
      </Box>
    );
  }

  // ── result ──
  if (view === "result" && attempt) {
    const total = attempt.total ?? 0;
    const score = attempt.score ?? 0;
    const pct = total ? Math.round((score / total) * 100) : 0;
    const scoreColor = pct >= 60 ? "success.main" : pct >= 35 ? "warning.main" : "error.main";
    return (
      <Box sx={{ maxWidth: 900, mx: "auto", p: { xs: 2, sm: 3, md: 4 } }}>
        <CompletedPanel title={attempt.exam.title} receipt={clockTime(attempt.submitted_at)} auto={!!attempt.auto_submitted} />
        <Stack direction="row" justifyContent="center" sx={{ mb: 3 }}>
          <Button variant="contained" startIcon={<ChevronLeftIcon />} onClick={() => { clearExamSession(id); router.push("/app/exams"); }}>Go to my exams</Button>
        </Stack>
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", mb: 3 }}>
          <CardContent sx={{ textAlign: "center", py: 4 }}>
            <Typography variant="h3" fontWeight={700} sx={{ fontFamily: "ui-monospace, monospace", color: scoreColor }}>{score}/{total}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{pct}% — {pct >= 60 ? "Well done!" : "Keep practicing"}</Typography>
          </CardContent>
        </Card>

        {attempt.sections.map((s) => (
          <Box key={s.id} sx={{ mb: 3 }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>{s.title}</Typography>
            {s.type === "coding" ? (
              <Stack spacing={1.5}>
                {(s.problems ?? []).map((p) => {
                  const cState = attempt.coding_state[p.id];
                  const solved = cState?.status === "answered";
                  return (
                    <Card key={p.id} variant="outlined" sx={{ borderColor: "outlineVariant" }}>
                      <CardContent sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {solved ? <CheckCircleIcon sx={{ fontSize: 18, color: "success.main", flexShrink: 0 }} /> : <CancelIcon sx={{ fontSize: 18, color: "error.main", flexShrink: 0 }} />}
                        <Typography variant="body2" sx={{ flex: 1 }}>{p.title}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {solved ? `${cState?.verdict ?? "Answered"} · ${cState?.score ?? 0} mark${(cState?.score ?? 0) === 1 ? "" : "s"}` : "Not attempted"}
                        </Typography>
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                {(s.questions ?? []).map((q, i) => {
                  const entry = attempt.question_state[q.id];
                  const selected = entry && Number.isInteger(entry.selectedIndex) ? entry.selectedIndex : null;
                  const correct = selected === q.correct_index;
                  return (
                    <Card key={q.id} variant="outlined" sx={{ borderColor: "outlineVariant" }}>
                      <CardContent>
                        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                          {correct ? <CheckCircleIcon sx={{ fontSize: 18, color: "success.main", mt: 0.25, flexShrink: 0 }} /> : <CancelIcon sx={{ fontSize: 18, color: "error.main", mt: 0.25, flexShrink: 0 }} />}
                          <Typography variant="body2" sx={{ flex: 1 }}>Q{i + 1}. {q.question_text}</Typography>
                        </Stack>
                        <Stack spacing={0.5} sx={{ ml: 3.5 }}>
                          {q.options.map((opt, oi) => {
                            const isCorrect = oi === q.correct_index;
                            const isSelected = oi === selected;
                            return (
                              <Stack key={oi} direction="row" spacing={1} alignItems="center" sx={{ px: 1, py: 0.5, borderRadius: 1, bgcolor: isCorrect ? "successContainer" : isSelected ? "errorContainer" : "transparent", color: isCorrect ? "onSuccessContainer" : isSelected ? "onErrorContainer" : "text.secondary" }}>
                                <Typography variant="caption" fontWeight={700}>{String.fromCharCode(65 + oi)}</Typography>
                                <Typography variant="caption" sx={{ flex: 1 }}>{opt}</Typography>
                                {isCorrect && <Typography variant="caption">correct</Typography>}
                                {isSelected && !isCorrect && <Typography variant="caption">your answer</Typography>}
                              </Stack>
                            );
                          })}
                        </Stack>
                        {q.explanation && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, ml: 3.5, fontStyle: "italic" }}>{q.explanation}</Typography>}
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            )}
          </Box>
        ))}
      </Box>
    );
  }

  // ── taking the exam ──
  if (view === "taking" && attempt && item && section) {
    const q = item.type === "mcq" ? section.questions?.find((x) => x.id === item.itemId) : undefined;
    const problem = item.type === "coding" ? section.problems?.find((x) => x.id === item.itemId) : undefined;
    const qState = item.type === "mcq" ? attempt.question_state[item.itemId] : undefined;
    const marked = qState?.status === "marked" || qState?.status === "answered_marked";
    const marks = item.type === "mcq" ? (q?.marks ?? section.marks_per_question) : section.marks_per_question;
    const user = (() => { try { return JSON.parse(localStorage.getItem("user") || "null") as { name?: string; roll_no?: string; rollNo?: string } | null; } catch { return null; } })();

    const panel = (
      <ExamPalette
        sections={paletteSections} activeSectionId={section.id} activeItemId={item.itemId} timerLabel={timer.label} timerLow={timer.low}
        onJump={jumpTo} onClose={wide ? undefined : () => setPanelOpen(false)}
      />
    );
    const questionPane = (
      <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, bgcolor: "surfaceContainerLowest", borderRadius: 2, overflow: "hidden", border: "1px solid", borderColor: "outlineVariant" }}>
        <Stack direction="row" alignItems="center" sx={{ px: 2, py: 1.25, bgcolor: "primaryContainer", color: "onPrimaryContainer" }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>{item.type === "mcq" ? "Select the correct answer" : problem?.title ?? "Coding problem"}</Typography>
          {item.type === "mcq" && (
            <Button size="small" variant={marked ? "contained" : "outlined"} color={marked ? "warning" : "inherit"} startIcon={<FlagOutlinedIcon fontSize="small" />} onClick={() => toggleMark(section.id, item.itemId)} sx={{ color: marked ? undefined : "inherit", borderColor: "currentColor" }}>
              {marked ? "Marked for review" : "Mark for review"}
            </Button>
          )}
        </Stack>
        <Box sx={{ p: 2.5, overflowY: "auto", flex: 1, zoom: prefs.fontScale / 100 }}>
          {item.type === "mcq" ? (
            <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>{q?.question_text}</Typography>
          ) : (
            <Stack spacing={2}>
              <Typography variant="body1">{problem?.title}</Typography>
              <Stack direction="row" spacing={1}>
                {problem?.difficulty && <Chip label={problem.difficulty} size="small" sx={{ textTransform: "capitalize" }} />}
                {attempt.coding_state[item.itemId]?.status === "answered" && <Chip label="Solved" size="small" color="success" />}
              </Stack>
              <Alert severity="info">The code editor opens on its own screen. Your timer keeps running there and your progress is saved. Use &quot;Back to Exam&quot; to return.</Alert>
            </Stack>
          )}
        </Box>
      </Box>
    );
    const answerPane = (
      <Box sx={{ minHeight: 0, bgcolor: "surfaceContainerLowest", borderRadius: 2, border: "1px solid", borderColor: "outlineVariant", p: 2.5, overflowY: "auto", zoom: prefs.fontScale / 100 }}>
        {item.type === "mcq" && q ? (
          <Stack spacing={1.25} role="radiogroup" aria-label="Options">
            {q.options.map((opt, oi) => {
              const sel = qState?.selectedIndex === oi;
              return (
                <Box
                  key={oi} component="button" type="button" role="radio" aria-checked={sel} onClick={() => choose(section.id, q.id, oi)}
                  sx={{
                    width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 1.5, px: 2, py: 1.5, borderRadius: 2, border: "1.5px solid",
                    borderColor: sel ? "primary.main" : "outlineVariant", bgcolor: sel ? "primaryContainer" : "transparent", color: sel ? "onPrimaryContainer" : "text.primary",
                    cursor: "pointer", font: "inherit", "&:hover": { bgcolor: sel ? "primaryContainer" : "surfaceContainerHigh" },
                    "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
                  }}
                >
                  <Box aria-hidden sx={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid", borderColor: sel ? "primary.main" : "outline", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    {sel && <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: "primary.main" }} />}
                  </Box>
                  <Typography variant="body1" component="span" sx={{ flex: 1 }}>{opt}</Typography>
                  <Typography variant="caption" color="text.secondary" aria-hidden sx={{ display: { xs: "none", md: "block" } }}>{oi + 1}</Typography>
                </Box>
              );
            })}
          </Stack>
        ) : item.type === "coding" && problem ? (
          <Stack spacing={2} alignItems="flex-start">
            <Typography variant="body2" color="text.secondary">{attempt.coding_state[item.itemId]?.status === "answered" ? `Your best result so far: ${attempt.coding_state[item.itemId]?.verdict ?? "answered"}.` : "You have not submitted a solution yet."}</Typography>
            <Button variant="contained" size="large" onClick={() => solveProblem(section.id, problem.id)}>
              {attempt.coding_state[item.itemId]?.status === "answered" ? "Open the code editor again" : "Open the code editor"}
            </Button>
          </Stack>
        ) : null}
      </Box>
    );

    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100dvh", bgcolor: "background.default" }}>
        <ExamHeader
          title={attempt.exam.title} sectionTitle={section.title} sectionNumber={sectionNumber} sectionCount={attempt.sections.length}
          itemNumber={itemInSection} itemCount={itemsInSection} marksLabel={`${marks} mark${marks === 1 ? "" : "s"}`}
          timerLabel={timer.label} timerLow={timer.low} studentName={user?.name ?? null} rollNo={user?.roll_no ?? user?.rollNo ?? null} fontScale={prefs.fontScale}
          saveIndicator={<SaveIndicator status={saver.status} lastSavedAt={saver.lastSavedAt} pendingCount={saver.pendingCount} />}
          panelOpen={panelOpen} onOpenInstructions={() => setInfoOpen(true)} onOpenSettings={() => setSettingsOpen(true)} onTogglePanel={() => setPanelOpen((v) => !v)}
        />
        <ExamNotice
          text={proctor.notice ?? (!proctor.fullscreen ? "This exam runs in fullscreen." : null)}
          showFullscreen={!proctor.fullscreen} onFullscreen={proctor.requestFullscreen} onDismiss={proctor.dismissNotice}
        />

        <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
          <Box component="main" id="main-content" sx={{ flex: 1, minWidth: 0, minHeight: 0, p: { xs: 1, md: 2 }, display: "grid", gap: { xs: 1, md: 2 }, gridTemplateColumns: prefs.layout === "side" && wide ? "1fr 1fr" : "1fr", gridTemplateRows: prefs.layout === "side" && wide ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)" }}>
            {questionPane}
            {answerPane}
          </Box>
          {wide && panelOpen && <Box sx={{ width: 320, flexShrink: 0, minHeight: 0 }}>{panel}</Box>}
        </Box>
        {!wide && (
          <Drawer anchor="right" open={panelOpen} onClose={() => setPanelOpen(false)} slotProps={{ paper: { sx: { width: "min(340px, 90vw)" } } }}>{panel}</Drawer>
        )}

        <Box component="footer" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, px: { xs: 1, md: 2 }, py: 1, borderTop: "1px solid", borderColor: "outlineVariant", bgcolor: "surfaceContainerLowest", flexShrink: 0 }}>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" color="error" onClick={() => setFinishOpen(true)}>Finish</Button>
            {item.type === "mcq" && (
              <Button variant="outlined" startIcon={<DeleteOutlineIcon fontSize="small" />} disabled={!qState || !Number.isInteger(qState.selectedIndex)} onClick={() => clearAnswer(section.id, item.itemId)}>Clear</Button>
            )}
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startIcon={<ChevronLeftIcon />} onClick={() => setCurrent(idx - 1)} disabled={idx <= 0}>Prev</Button>
            <Button variant="outlined" endIcon={<ChevronRightIcon />} onClick={() => setCurrent(idx + 1)} disabled={idx >= items.length - 1}>Next</Button>
          </Stack>
        </Box>

        <FinishDialog open={finishOpen} onClose={() => setFinishOpen(false)} onConfirm={doSubmit} submitting={submitting} tallies={tallies} timeLeftLabel={timer.secondsLeft > 0 ? timer.label : null} />
        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} prefs={prefs} onChange={updatePrefs} onReset={resetPrefs} />
        <InstructionsDialog
          open={infoOpen} onClose={() => setInfoOpen(false)} general={attempt.exam.general_instructions ?? null}
          rows={attempt.sections.map((s) => ({ id: s.id, title: s.title, type: s.type, count: s.type === "coding" ? (s.problems ?? []).length : (s.questions ?? []).length, marksEach: s.marks_per_question }))}
        />
      </Box>
    );
  }

  return null;
}
