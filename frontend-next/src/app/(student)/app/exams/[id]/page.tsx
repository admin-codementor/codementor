"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Alert from "@mui/material/Alert";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import Divider from "@mui/material/Divider";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Tooltip from "@mui/material/Tooltip";
import { AccessTimeIcon, ChevronLeftIcon, CheckCircleIcon, CancelIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/components/feedback/ToastProvider";
import { useExamTimer } from "@/hooks/useExamTimer";
import { QuestionNavigator, type NavigatorSection, type QuestionStatus } from "@/components/student/exam/QuestionNavigator";

interface InstrSection {
  id: string; title: string; type: "mcq" | "coding"; order: number; instructions: string | null;
  question_count: number; marks_per_question: number; negative_marking: number | null;
  total_marks: number; duration_minutes: number | null;
}
interface InstructionsData {
  exam: { id: string; title: string; description: string | null; general_instructions: string | null; window_start: string; window_end: string; duration_minutes: number };
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
interface CState { status: QuestionStatus; sectionId: string; score?: number }
interface AttemptView {
  exam: { id: string; title: string; duration_minutes: number };
  sections: AttemptSection[];
  question_state: Record<string, QState>;
  coding_state: Record<string, CState>;
  seconds_remaining: number | null;
  submitted: boolean;
  score: number | null;
  total: number | null;
}

type ViewState = "loading" | "error" | "instructions" | "taking" | "result";

function errStatus(e: unknown): number | undefined {
  return (e as { response?: { status?: number } })?.response?.status;
}

export default function StudentExamPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const id = params.id;

  const [view, setView] = React.useState<ViewState>("loading");
  const [errorMsg, setErrorMsg] = React.useState("");

  const [instructions, setInstructions] = React.useState<InstructionsData | null>(null);
  const [ackInstructions, setAckInstructions] = React.useState(false);
  const [starting, setStarting] = React.useState(false);

  const [attempt, setAttempt] = React.useState<AttemptView | null>(null);
  const [activeSectionId, setActiveSectionId] = React.useState<string | null>(null);
  const [activeItemId, setActiveItemId] = React.useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const visitedSectionsRef = React.useRef<Set<string>>(new Set());
  const questionRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

  // ── Initial load: resume an existing attempt, or fall back to instructions ──
  React.useEffect(() => {
    let alive = true;
    api.get(`/api/exams/${id}/attempt`)
      .then((r) => {
        if (!alive || !r.data?.success) return;
        const data: AttemptView = r.data.data;
        setAttempt(data);
        setActiveSectionId(data.sections[0]?.id ?? null);
        setView(data.submitted ? "result" : "taking");
      })
      .catch((e) => {
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
      });
    return () => { alive = false; };
  }, [id]);

  const startExam = async () => {
    setStarting(true);
    try {
      const r = await api.post(`/api/exams/${id}/start`, {});
      if (r.data?.success) {
        const data: AttemptView = r.data.data;
        setAttempt(data);
        setActiveSectionId(data.sections[0]?.id ?? null);
        setView("taking");
      }
    } catch (e) {
      toast(apiErrorMessage(e, "Couldn't start the exam."), { severity: "error" });
    } finally {
      setStarting(false);
    }
  };

  const doSubmit = React.useCallback(async () => {
    setSubmitting(true);
    try {
      await api.post(`/api/exams/${id}/submit`, {});
    } catch {
      // Fall through and refresh anyway — e.g. a race with the timer's own
      // auto-submit lands here as "already submitted," which is fine; the
      // refresh below still gets the authoritative post-submit state.
    }
    try {
      const r = await api.get(`/api/exams/${id}/attempt`);
      if (r.data?.success) {
        setAttempt(r.data.data);
        setView("result");
      }
    } catch (e) {
      toast(apiErrorMessage(e, "Submitted, but couldn't load your result. Refresh to see it."), { severity: "error" });
    } finally {
      setSubmitting(false);
      setSummaryOpen(false);
    }
  }, [id, toast]);

  const timer = useExamTimer({
    initialSeconds: attempt?.seconds_remaining ?? 0,
    active: view === "taking" && !!attempt && !attempt.submitted,
    onExpire: doSubmit,
  });

  // Mark every not-yet-touched MCQ question in a section "visited" the moment
  // its tab is opened — Judge0's finalize() only fires on a coding submit, so
  // coding items have no equivalent ping wired up yet (PR-4), and stay
  // "not visited" in the navigator until then.
  const markSectionVisited = React.useCallback(async (sectionId: string) => {
    if (!attempt || visitedSectionsRef.current.has(sectionId)) return;
    visitedSectionsRef.current.add(sectionId);
    const section = attempt.sections.find((s) => s.id === sectionId);
    if (!section || section.type !== "mcq") return;
    const notVisited = (section.questions ?? []).filter((q) => !attempt.question_state[q.id]);
    if (notVisited.length === 0) return;
    setAttempt((prev) => {
      if (!prev) return prev;
      const next = { ...prev.question_state };
      for (const q of notVisited) next[q.id] = { status: "visited", selectedIndex: null, sectionId };
      return { ...prev, question_state: next };
    });
    await Promise.all(notVisited.map((q) =>
      api.patch(`/api/exams/${id}/attempt/questions/${q.id}`, { section_id: sectionId }).catch(() => {})
    ));
  }, [attempt, id]);

  React.useEffect(() => {
    if (view === "taking" && activeSectionId) markSectionVisited(activeSectionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeSectionId]);

  const answerQuestion = React.useCallback(async (sectionId: string, questionId: string, selectedIndex: number) => {
    if (!attempt) return;
    const prevEntry = attempt.question_state[questionId];
    const marked = prevEntry?.status === "marked" || prevEntry?.status === "answered_marked";
    const status: QuestionStatus = marked ? "answered_marked" : "answered";
    setAttempt((prev) => prev && ({ ...prev, question_state: { ...prev.question_state, [questionId]: { status, selectedIndex, sectionId } } }));
    try {
      await api.patch(`/api/exams/${id}/attempt/questions/${questionId}`, { section_id: sectionId, selected_index: selectedIndex, marked });
    } catch (e) {
      toast(apiErrorMessage(e, "Couldn't save your answer."), { severity: "error" });
    }
  }, [attempt, id, toast]);

  const toggleMark = React.useCallback(async (sectionId: string, questionId: string) => {
    if (!attempt) return;
    const prevEntry = attempt.question_state[questionId];
    const hasAnswer = !!prevEntry && Number.isInteger(prevEntry.selectedIndex);
    const nowMarked = !(prevEntry?.status === "marked" || prevEntry?.status === "answered_marked");
    const status: QuestionStatus = hasAnswer ? (nowMarked ? "answered_marked" : "answered") : (nowMarked ? "marked" : "visited");
    const selectedIndex = hasAnswer ? prevEntry!.selectedIndex : null;
    setAttempt((prev) => prev && ({ ...prev, question_state: { ...prev.question_state, [questionId]: { status, selectedIndex, sectionId } } }));
    try {
      await api.patch(`/api/exams/${id}/attempt/questions/${questionId}`, {
        section_id: sectionId, marked: nowMarked,
        ...(hasAnswer ? { selected_index: selectedIndex } : {}),
      });
    } catch (e) {
      toast(apiErrorMessage(e, "Couldn't update mark for review."), { severity: "error" });
    }
  }, [attempt, id, toast]);

  const handleJump = (sectionId: string, itemId: string) => {
    setActiveSectionId(sectionId);
    setActiveItemId(itemId);
    requestAnimationFrame(() => {
      questionRefs.current[itemId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const navigatorSections: NavigatorSection[] = React.useMemo(() => {
    if (!attempt) return [];
    return attempt.sections.map((s) => (
      s.type === "coding"
        ? { id: s.id, title: s.title, type: "coding" as const, items: (s.problems ?? []).map((p) => ({ id: p.id, status: attempt.coding_state[p.id]?.status ?? "not_visited" })) }
        : { id: s.id, title: s.title, type: "mcq" as const, items: (s.questions ?? []).map((q) => ({ id: q.id, status: attempt.question_state[q.id]?.status ?? "not_visited" })) }
    ));
  }, [attempt]);

  const summaryStats = React.useMemo(() => {
    if (!attempt) return [];
    return attempt.sections.map((s) => {
      const items = s.type === "mcq" ? (s.questions ?? []).map((q) => q.id) : (s.problems ?? []).map((p) => p.id);
      const stateMap: Record<string, { status: QuestionStatus }> = s.type === "mcq" ? attempt.question_state : attempt.coding_state;
      let answered = 0, notAnswered = 0, notVisited = 0;
      for (const itemId of items) {
        const st = stateMap[itemId]?.status ?? "not_visited";
        if (st === "answered" || st === "answered_marked") answered += 1;
        else if (st === "not_visited") notVisited += 1;
        else notAnswered += 1;
      }
      return { id: s.id, title: s.title, total: items.length, answered, notAnswered, notVisited };
    });
  }, [attempt]);

  // ── Loading / error ──
  if (view === "loading") {
    return <Stack spacing={2}><Skeleton variant="rounded" height={40} width="40%" /><Skeleton variant="rounded" height={320} /></Stack>;
  }
  if (view === "error") {
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => router.push("/app/exams")}>Back</Button>}>
        {errorMsg}
      </Alert>
    );
  }

  // ── Instructions ──
  if (view === "instructions" && instructions) {
    return (
      <Box sx={{ maxWidth: 720, mx: "auto" }}>
        <Button startIcon={<ChevronLeftIcon />} onClick={() => router.push("/app/exams")} sx={{ mb: 2 }}>Back to exams</Button>
        <Typography variant="h5" fontWeight={600}>{instructions.exam.title}</Typography>
        {instructions.exam.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{instructions.exam.description}</Typography>
        )}
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
                    <TableCell>
                      {s.title} <Chip size="small" label={s.type} sx={{ ml: 1, height: 16, fontSize: 9, textTransform: "uppercase" }} />
                    </TableCell>
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

  // ── Result ──
  if (view === "result" && attempt) {
    const total = attempt.total ?? 0;
    const score = attempt.score ?? 0;
    const pct = total ? Math.round((score / total) * 100) : 0;
    const scoreColor = pct >= 60 ? "success.main" : pct >= 35 ? "warning.main" : "error.main";
    return (
      <Box>
        <Button startIcon={<ChevronLeftIcon />} onClick={() => router.push("/app/exams")} sx={{ mb: 2 }}>Back to exams</Button>
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", mb: 3 }}>
          <CardContent sx={{ textAlign: "center", py: 4 }}>
            <Typography variant="h3" fontWeight={700} sx={{ fontFamily: "ui-monospace, monospace", color: scoreColor }}>
              {score}/{total}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {pct}% — {pct >= 60 ? "Well done!" : "Keep practicing"}
            </Typography>
          </CardContent>
        </Card>

        {attempt.sections.map((s) => (
          <Box key={s.id} sx={{ mb: 3 }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>{s.title}</Typography>
            {s.type === "coding" ? (
              <Alert severity="info">Coding-section results aren&apos;t available yet — coming in a future update.</Alert>
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
                          {correct
                            ? <CheckCircleIcon sx={{ fontSize: 18, color: "success.main", mt: 0.25, flexShrink: 0 }} />
                            : <CancelIcon sx={{ fontSize: 18, color: "error.main", mt: 0.25, flexShrink: 0 }} />}
                          <Typography variant="body2" sx={{ flex: 1 }}>Q{i + 1}. {q.question_text}</Typography>
                        </Stack>
                        <Stack spacing={0.5} sx={{ ml: 3.5 }}>
                          {q.options.map((opt, oi) => {
                            const isCorrect = oi === q.correct_index;
                            const isSelected = oi === selected;
                            return (
                              <Stack
                                key={oi} direction="row" spacing={1} alignItems="center"
                                sx={{
                                  px: 1, py: 0.5, borderRadius: 1,
                                  bgcolor: isCorrect ? "successContainer" : isSelected ? "errorContainer" : "transparent",
                                  color: isCorrect ? "onSuccessContainer" : isSelected ? "onErrorContainer" : "text.secondary",
                                }}
                              >
                                <Typography variant="caption" fontWeight={700}>{String.fromCharCode(65 + oi)}</Typography>
                                <Typography variant="caption" sx={{ flex: 1 }}>{opt}</Typography>
                                {isCorrect && <Typography variant="caption">correct</Typography>}
                                {isSelected && !isCorrect && <Typography variant="caption">your answer</Typography>}
                              </Stack>
                            );
                          })}
                        </Stack>
                        {q.explanation && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, ml: 3.5, fontStyle: "italic" }}>
                            {q.explanation}
                          </Typography>
                        )}
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

  // ── Taking ──
  if (view === "taking" && attempt) {
    const activeSection = attempt.sections.find((s) => s.id === activeSectionId) ?? attempt.sections[0];
    return (
      <Box sx={{ mx: { xs: -2, sm: -3, md: -4 }, mt: { xs: -2, sm: -3, md: -4 } }}>
        <AppBar position="sticky" color="default" elevation={0} sx={{ borderBottom: "1px solid", borderColor: "outlineVariant", bgcolor: "surfaceContainer" }}>
          <Toolbar sx={{ flexWrap: "wrap", gap: 1, py: 1 }}>
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Typography variant="subtitle1" fontWeight={600}>{attempt.exam.title}</Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ color: timer.low ? "error.main" : "text.primary" }}>
              <AccessTimeIcon fontSize="small" />
              <Typography variant="h6" sx={{ fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>{timer.label}</Typography>
            </Stack>
            <Button variant="contained" color="success" onClick={() => setSummaryOpen(true)}>Finish</Button>
          </Toolbar>
          <Tabs
            value={activeSectionId ?? false}
            onChange={(_, v) => setActiveSectionId(v)}
            variant="scrollable" scrollButtons="auto"
            sx={{ borderTop: "1px solid", borderColor: "outlineVariant", px: 2, minHeight: 40 }}
          >
            {attempt.sections.map((s) => <Tab key={s.id} value={s.id} label={s.title} sx={{ minHeight: 40 }} />)}
          </Tabs>
        </AppBar>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 280px" }, gap: 3, p: { xs: 2, sm: 3 }, maxWidth: 1100, mx: "auto" }}>
          <Box>
            {activeSection?.type === "mcq" ? (
              <Stack spacing={2.5}>
                {(activeSection.questions ?? []).map((q, qi) => {
                  const entry = attempt.question_state[q.id];
                  const marked = entry?.status === "marked" || entry?.status === "answered_marked";
                  return (
                    <Card
                      key={q.id}
                      ref={(el: HTMLDivElement | null) => { questionRefs.current[q.id] = el; }}
                      variant="outlined"
                      sx={{ borderColor: activeItemId === q.id ? "primary.main" : "outlineVariant" }}
                    >
                      <CardContent>
                        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
                          <Stack direction="row" spacing={1} sx={{ flex: 1, minWidth: 200 }}>
                            <Typography variant="caption" fontWeight={700} color="primary.main">Q{qi + 1}</Typography>
                            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{q.question_text}</Typography>
                          </Stack>
                          <Button
                            size="small" variant={marked ? "contained" : "outlined"} color={marked ? "warning" : "inherit"}
                            onClick={() => toggleMark(activeSection.id, q.id)} sx={{ flexShrink: 0 }}
                          >
                            {marked ? "Marked" : "Mark for review"}
                          </Button>
                        </Stack>
                        <Stack spacing={1}>
                          {q.options.map((opt, oi) => {
                            const sel = entry?.selectedIndex === oi;
                            return (
                              <Box
                                key={oi} component="button" onClick={() => answerQuestion(activeSection.id, q.id, oi)}
                                sx={{
                                  width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 1,
                                  px: 1.5, py: 1.25, borderRadius: 2, border: "1px solid",
                                  borderColor: sel ? "primary.main" : "outlineVariant",
                                  bgcolor: sel ? "primaryContainer" : "transparent",
                                  color: sel ? "onPrimaryContainer" : "text.secondary",
                                  cursor: "pointer", font: "inherit",
                                  "&:hover": { borderColor: sel ? "primary.main" : "outline" },
                                }}
                              >
                                <Box
                                  aria-hidden
                                  sx={{
                                    width: 22, height: 22, borderRadius: "50%", border: "1px solid",
                                    borderColor: sel ? "primary.main" : "outline", display: "grid", placeItems: "center",
                                    fontSize: 11, fontWeight: 700, flexShrink: 0, color: sel ? "primary.main" : "text.secondary",
                                  }}
                                >
                                  {String.fromCharCode(65 + oi)}
                                </Box>
                                <Typography variant="body2">{opt}</Typography>
                              </Box>
                            );
                          })}
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            ) : (
              <Stack spacing={2}>
                <Alert severity="info">Coding sections open for solving in a future update — shown here for reference.</Alert>
                {(activeSection?.problems ?? []).map((p) => (
                  <Card
                    key={p.id}
                    ref={(el: HTMLDivElement | null) => { questionRefs.current[p.id] = el; }}
                    variant="outlined" sx={{ borderColor: "outlineVariant" }}
                  >
                    <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <Typography variant="body2" sx={{ flex: 1 }}>{p.title}</Typography>
                      {p.difficulty && <Chip label={p.difficulty} size="small" sx={{ textTransform: "capitalize" }} />}
                      <Tooltip title="Coming in a future update">
                        <span><Button size="small" variant="outlined" disabled>Solve</Button></span>
                      </Tooltip>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </Box>

          <Box sx={{ position: { md: "sticky" }, top: { md: 96 }, alignSelf: "start" }}>
            <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: 2 }}>
              <QuestionNavigator
                sections={navigatorSections}
                activeSectionId={activeSection?.id ?? ""}
                activeItemId={activeItemId}
                onJump={handleJump}
              />
            </Card>
          </Box>
        </Box>

        <Dialog open={summaryOpen} onClose={() => setSummaryOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Test Summary</DialogTitle>
          <DialogContent dividers>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Section</TableCell>
                  <TableCell align="right">Answered</TableCell>
                  <TableCell align="right">Not answered</TableCell>
                  <TableCell align="right">Not visited</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summaryStats.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.title}</TableCell>
                    <TableCell align="right">{s.answered}</TableCell>
                    <TableCell align="right">{s.notAnswered}</TableCell>
                    <TableCell align="right">{s.notVisited}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {timer.secondsLeft > 0 && (
              <Alert severity="info" icon={<AccessTimeIcon />} sx={{ mt: 2 }}>
                You still have {timer.label} left. Are you sure you want to finish and submit?
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSummaryOpen(false)} disabled={submitting}>No, continue</Button>
            <Button variant="contained" color="success" onClick={doSubmit} disabled={submitting}>
              {submitting ? "Submitting…" : "Yes, finish and submit"}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  return null;
}
