"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import { PsychologyOutlinedIcon, AccessTimeIcon, EmojiEventsOutlinedIcon, CheckCircleIcon, CancelIcon, ChevronLeftIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/States";
import { useToast } from "@/components/feedback/ToastProvider";
import { Reveal } from "@/components/ui/motion";

interface TestCard {
  id: string;
  title: string;
  description: string | null;
  category: string;
  durationMinutes: number;
  questionCount: number;
  attempted: boolean;
  score: number | null;
  total: number | null;
}
interface Question {
  id: string;
  question_text: string;
  options: string[];
  marks: number;
  topic: string | null;
}
interface ReviewItem {
  questionId: string;
  selected: number | null;
  correctIndex: number;
  correct: boolean;
  explanation: string | null;
}

const CATEGORY_TONE: Record<string, { bg: string; fg: string }> = {
  aptitude: { bg: "primaryContainer", fg: "onPrimaryContainer" },
  technical: { bg: "tertiaryContainer", fg: "onTertiaryContainer" },
  verbal: { bg: "successContainer", fg: "onSuccessContainer" },
  logical: { bg: "warningContainer", fg: "onWarningContainer" },
  general: { bg: "surfaceContainerHigh", fg: "onSurfaceVariant" },
};
function catTone(c: string) {
  return CATEGORY_TONE[c] ?? CATEGORY_TONE.aptitude;
}

function mmss(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function AptitudePage() {
  const showToast = useToast();
  const [view, setView] = React.useState<"list" | "taking" | "result">("list");
  const [tests, setTests] = React.useState<TestCard[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [active, setActive] = React.useState<{ id: string; title: string; durationMinutes: number } | null>(null);
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [answers, setAnswers] = React.useState<Record<string, number>>({});
  const [secondsLeft, setSecondsLeft] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<{ score: number; total: number; review: ReviewItem[] } | null>(null);
  const submitRef = React.useRef<() => void>(() => {});

  const loadList = React.useCallback(() => {
    setLoading(true);
    api
      .get("/api/mcq/available")
      .then((r) => {
        if (r.data?.success) setTests(r.data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    loadList();
  }, [loadList]);

  const startTest = async (id: string) => {
    try {
      const r = await api.get(`/api/mcq/${id}/start`);
      if (!r.data?.success) return;
      setActive(r.data.data.test);
      setQuestions(r.data.data.questions);
      setAnswers({});
      setSecondsLeft(r.data.data.test.durationMinutes * 60);
      setView("taking");
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err?.response?.data?.error || "Could not start the test.", { severity: "error" });
      loadList();
    }
  };

  const submit = React.useCallback(async () => {
    if (!active || submitting) return;
    setSubmitting(true);
    try {
      const r = await api.post(`/api/mcq/${active.id}/submit`, { responses: answers });
      if (r.data?.success) {
        setResult(r.data.data);
        setView("result");
      }
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err?.response?.data?.error || "Submit failed.", { severity: "error" });
    } finally {
      setSubmitting(false);
    }
  }, [active, answers, submitting]);

  // Keep the ref pointed at the latest submit so the timer can call it without
  // re-subscribing the interval each second.
  React.useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  // Countdown with auto-submit at zero.
  React.useEffect(() => {
    if (view !== "taking") return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          submitRef.current();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [view]);

  const answeredCount = Object.keys(answers).length;

  // ── List view ──
  if (view === "list") {
    return (
      <Box>
        <PageHeader
          title="Aptitude & MCQ Tests"
          subtitle="Timed assessments for placement preparation — aptitude, technical, verbal and logical reasoning."
        />
        {loading ? (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} variant="outlined" sx={{ p: 2.5, borderColor: "outlineVariant" }}>
                <Skeleton width="40%" />
                <Skeleton width="70%" height={28} sx={{ mt: 1 }} />
                <Skeleton width="100%" height={36} sx={{ mt: 2 }} />
              </Card>
            ))}
          </Box>
        ) : tests.length === 0 ? (
          <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
            <EmptyState icon={<PsychologyOutlinedIcon />} title="No tests published yet" description="Check back soon." />
          </Card>
        ) : (
          <Reveal>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            {tests.map((t) => {
              const tone = catTone(t.category);
              return (
                <Card key={t.id} variant="outlined" sx={{ borderColor: "outlineVariant" }}>
                  <CardContent>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                      <Chip label={t.category} size="small" sx={{ textTransform: "uppercase", fontWeight: 700, fontSize: 10, bgcolor: tone.bg, color: tone.fg }} />
                      {t.attempted && (
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "success.main" }}>
                          <EmojiEventsOutlinedIcon sx={{ fontSize: 16 }} />
                          <Typography variant="caption" sx={{ fontFamily: "ui-monospace, monospace" }}>
                            {t.score}/{t.total}
                          </Typography>
                        </Stack>
                      )}
                    </Stack>
                    <Typography variant="subtitle1" fontWeight={600}>
                      {t.title}
                    </Typography>
                    {t.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {t.description}
                      </Typography>
                    )}
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        {t.questionCount} questions
                      </Typography>
                      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "text.secondary" }}>
                        <AccessTimeIcon sx={{ fontSize: 14 }} />
                        <Typography variant="caption">{t.durationMinutes} min</Typography>
                      </Stack>
                    </Stack>
                    <Button fullWidth variant="contained" onClick={() => startTest(t.id)} disabled={t.attempted} sx={{ mt: 2 }}>
                      {t.attempted ? "Completed" : "Start Test"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
          </Reveal>
        )}
      </Box>
    );
  }

  // ── Taking view ──
  if (view === "taking" && active) {
    const low = secondsLeft <= 60;
    return (
      <Box sx={{ mx: { xs: -2, sm: -3, md: -4 }, mt: { xs: -2, sm: -3, md: -4 } }}>
        <AppBar position="sticky" color="default" elevation={0} sx={{ borderBottom: "1px solid", borderColor: "outlineVariant", bgcolor: "surfaceContainer" }}>
          <Toolbar sx={{ justifyContent: "space-between" }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                {active.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {answeredCount}/{questions.length} answered
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ color: low ? "error.main" : "text.primary" }}>
              <AccessTimeIcon fontSize="small" />
              <Typography variant="h6" sx={{ fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>
                {mmss(secondsLeft)}
              </Typography>
            </Stack>
          </Toolbar>
        </AppBar>

        <Box sx={{ maxWidth: 760, mx: "auto", p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2.5}>
            {questions.map((q, qi) => (
              <Card key={q.id} variant="outlined" sx={{ borderColor: "outlineVariant" }}>
                <CardContent>
                  <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                    <Typography variant="caption" fontWeight={700} color="primary.main">
                      Q{qi + 1}
                    </Typography>
                    <Typography variant="body2" sx={{ flex: 1, whiteSpace: "pre-wrap" }}>
                      {q.question_text}
                    </Typography>
                  </Stack>
                  <Stack spacing={1}>
                    {q.options.map((opt, oi) => {
                      const sel = answers[q.id] === oi;
                      return (
                        <Box
                          key={oi}
                          component="button"
                          onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                          sx={{
                            width: "100%",
                            textAlign: "left",
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            px: 1.5,
                            py: 1.25,
                            borderRadius: 2,
                            border: "1px solid",
                            borderColor: sel ? "primary.main" : "outlineVariant",
                            bgcolor: sel ? "primaryContainer" : "transparent",
                            color: sel ? "onPrimaryContainer" : "text.secondary",
                            cursor: "pointer",
                            font: "inherit",
                            "&:hover": { borderColor: sel ? "primary.main" : "outline" },
                          }}
                        >
                          <Box
                            aria-hidden
                            sx={{
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              border: "1px solid",
                              borderColor: sel ? "primary.main" : "outline",
                              display: "grid",
                              placeItems: "center",
                              fontSize: 11,
                              fontWeight: 700,
                              flexShrink: 0,
                              color: sel ? "primary.main" : "text.secondary",
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
            ))}
            <Button variant="contained" color="success" size="large" onClick={submit} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit Test"}
            </Button>
          </Stack>
        </Box>
      </Box>
    );
  }

  // ── Result view ──
  if (view === "result" && result) {
    const pct = result.total ? Math.round((result.score / result.total) * 100) : 0;
    const qById = new Map(questions.map((q) => [q.id, q]));
    const scoreColor = pct >= 60 ? "success.main" : pct >= 35 ? "warning.main" : "error.main";
    return (
      <Box>
        <Button
          startIcon={<ChevronLeftIcon />}
          onClick={() => {
            setView("list");
            setResult(null);
            loadList();
          }}
          sx={{ mb: 2 }}
        >
          Back to tests
        </Button>

        <Card variant="outlined" sx={{ borderColor: "outlineVariant", mb: 3 }}>
          <CardContent sx={{ textAlign: "center", py: 4 }}>
            <Typography variant="h3" fontWeight={700} sx={{ fontFamily: "ui-monospace, monospace", color: scoreColor }}>
              {result.score}/{result.total}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {pct}% — {pct >= 60 ? "Well done!" : "Keep practicing"}
            </Typography>
          </CardContent>
        </Card>

        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
          Review
        </Typography>
        <Stack spacing={1.5}>
          {result.review.map((rv, i) => {
            const q = qById.get(rv.questionId);
            if (!q) return null;
            return (
              <Card key={rv.questionId} variant="outlined" sx={{ borderColor: "outlineVariant" }}>
                <CardContent>
                  <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                    {rv.correct ? (
                      <CheckCircleIcon sx={{ fontSize: 18, color: "success.main", mt: 0.25, flexShrink: 0 }} />
                    ) : (
                      <CancelIcon sx={{ fontSize: 18, color: "error.main", mt: 0.25, flexShrink: 0 }} />
                    )}
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      Q{i + 1}. {q.question_text}
                    </Typography>
                  </Stack>
                  <Stack spacing={0.5} sx={{ ml: 3.5 }}>
                    {q.options.map((opt, oi) => {
                      const isCorrect = oi === rv.correctIndex;
                      const isSelected = oi === rv.selected;
                      return (
                        <Stack
                          key={oi}
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          sx={{
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                            bgcolor: isCorrect ? "successContainer" : isSelected ? "errorContainer" : "transparent",
                            color: isCorrect ? "onSuccessContainer" : isSelected ? "onErrorContainer" : "text.secondary",
                          }}
                        >
                          <Typography variant="caption" fontWeight={700}>
                            {String.fromCharCode(65 + oi)}
                          </Typography>
                          <Typography variant="caption" sx={{ flex: 1 }}>
                            {opt}
                          </Typography>
                          {isCorrect && <Typography variant="caption">correct</Typography>}
                          {isSelected && !isCorrect && <Typography variant="caption">your answer</Typography>}
                        </Stack>
                      );
                    })}
                  </Stack>
                  {rv.explanation && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, ml: 3.5, fontStyle: "italic" }}>
                      {rv.explanation}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      </Box>
    );
  }

  return null;
}
