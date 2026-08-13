"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Reorder, useDragControls } from "framer-motion";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Radio from "@mui/material/Radio";
import Skeleton from "@mui/material/Skeleton";
import Divider from "@mui/material/Divider";
import Tooltip from "@mui/material/Tooltip";
import Card from "@mui/material/Card";
import {
  AddIcon, CloseIcon, DragHandleIcon, DeleteOutlineIcon, VisibilityOutlinedIcon,
  VisibilityOffOutlinedIcon, ExpandLessIcon, ExpandMoreIcon,
} from "@/components/ui/icons";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/components/feedback/ToastProvider";
import { AuthoringShell, CheckLine, type SaveState, type AuthoringStep } from "@/components/faculty/AuthoringShell";

const CATEGORIES = ["aptitude", "technical", "verbal", "logical", "general"];

interface Question {
  /** Stable client key so reorder and edits survive re-renders. */
  key: string;
  question_text: string;
  options: string[];
  correct_index: number;
  marks: number;
  topic: string;
  explanation: string;
}

let keySeq = 0;
const newKey = () => `q${++keySeq}-${Math.random().toString(36).slice(2, 7)}`;
const blankQuestion = (): Question => ({
  key: newKey(), question_text: "", options: ["", ""], correct_index: 0, marks: 1, topic: "", explanation: "",
});

const isComplete = (q: Question) =>
  !!q.question_text.trim() &&
  q.options.length >= 2 &&
  q.options.every((o) => o.trim()) &&
  q.correct_index >= 0 &&
  q.correct_index < q.options.length;

// Up/down buttons sit alongside the drag handle because drag-and-drop is
// unreachable with a keyboard or screen reader — without them, question order
// would be mouse-only.
function QuestionCard({
  q, index, total, onChange, onDelete, onMove,
}: {
  q: Question;
  index: number;
  total: number;
  onChange: (make: (cur: Question) => Partial<Question>) => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
}) {
  const controls = useDragControls();
  const complete = isComplete(q);

  return (
    <Reorder.Item value={q.key} dragListener={false} dragControls={controls} style={{ listStyle: "none" }}>
      <Card
        variant="outlined"
        sx={{ mb: 1.5, borderColor: complete ? "outlineVariant" : "warning.main", p: 1.5 }}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Box
            onPointerDown={(e) => controls.start(e)}
            sx={{ cursor: "grab", display: "flex", color: "text.disabled", touchAction: "none" }}
            role="button"
            aria-label={`Reorder question ${index + 1}`}
          >
            <DragHandleIcon fontSize="small" />
          </Box>
          <Typography variant="caption" fontWeight={700} color="primary.main">Question {index + 1}</Typography>
          {!complete && (
            <Chip label="Incomplete" size="small" sx={{ height: 18, fontSize: 10, bgcolor: "warningContainer", color: "onWarningContainer" }} />
          )}
          <Box sx={{ flex: 1 }} />
          <IconButton size="small" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move question ${index + 1} up`}>
            <ExpandLessIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" disabled={index === total - 1} onClick={() => onMove(1)} aria-label={`Move question ${index + 1} down`}>
            <ExpandMoreIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" color="error" onClick={onDelete} aria-label={`Delete question ${index + 1}`}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Stack>

        <TextField
          fullWidth size="small" multiline minRows={2} placeholder="Question text"
          value={q.question_text}
          onChange={(e) => { const v = e.target.value; onChange(() => ({ question_text: v })); }}
          sx={{ mb: 1.5 }}
        />

        <Stack spacing={1}>
          {q.options.map((opt, oi) => (
            <Stack key={oi} direction="row" spacing={1} alignItems="center">
              <Tooltip title="Mark as the correct answer">
                <Radio
                  size="small" color="success" checked={q.correct_index === oi}
                  onChange={() => onChange(() => ({ correct_index: oi }))}
                  inputProps={{ "aria-label": `Option ${String.fromCharCode(65 + oi)} is correct` }}
                />
              </Tooltip>
              <TextField
                fullWidth size="small" placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                value={opt}
                onChange={(e) => { const v = e.target.value; onChange((cur) => ({ options: cur.options.map((o, j) => (j === oi ? v : o)) })); }}
              />
              {q.options.length > 2 && (
                <IconButton
                  size="small" aria-label={`Remove option ${String.fromCharCode(65 + oi)}`}
                  onClick={() => onChange((cur) => ({
                    options: cur.options.filter((_, j) => j !== oi),
                    // Keep the correct answer pointing at the same option where
                    // possible, and never leave it out of range.
                    correct_index: cur.correct_index > oi
                      ? cur.correct_index - 1
                      : Math.min(cur.correct_index, cur.options.length - 2),
                  }))}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              )}
            </Stack>
          ))}
        </Stack>

        <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
          {q.options.length < 6 && (
            <Button size="small" onClick={() => onChange((cur) => ({ options: [...cur.options, ""] }))}>+ option</Button>
          )}
          <TextField
            size="small" placeholder="Topic (optional)" sx={{ width: 180 }} value={q.topic}
            onChange={(e) => { const v = e.target.value; onChange(() => ({ topic: v })); }}
          />
          <TextField
            size="small" label="Marks" type="number" sx={{ width: 90 }} value={q.marks}
            onChange={(e) => { const v = Math.max(1, parseInt(e.target.value) || 1); onChange(() => ({ marks: v })); }}
          />
        </Stack>

        <TextField
          fullWidth size="small" sx={{ mt: 1.5 }} placeholder="Explanation shown after submitting (optional)"
          value={q.explanation}
          onChange={(e) => { const v = e.target.value; onChange(() => ({ explanation: v })); }}
        />
      </Card>
    </Reorder.Item>
  );
}

export default function McqBuilderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const id = params.id;

  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [step, setStep] = React.useState(0);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [publishing, setPublishing] = React.useState(false);
  const [publishError, setPublishError] = React.useState("");

  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState("aptitude");
  const [duration, setDuration] = React.useState(30);
  const [isPublished, setIsPublished] = React.useState(false);
  const [questions, setQuestions] = React.useState<Question[]>([]);

  // Same ref-composition pattern as the other flows: same-tick edits compose, and
  // the debounced save always sends the newest values.
  const questionsRef = React.useRef<Question[]>([]);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = React.useRef(false);

  React.useEffect(() => {
    let alive = true;
    api
      .get(`/api/mcq/tests/${id}`)
      .then((r) => {
        if (!alive || !r.data?.success) return;
        const { test, questions: qs } = r.data.data;
        setTitle(test.title ?? "");
        setCategory(CATEGORIES.includes(test.category) ? test.category : "aptitude");
        setDuration(test.duration_minutes ?? 30);
        setIsPublished(!!test.is_published);
        const mapped: Question[] = (qs ?? []).map((q: Omit<Question, "key">) => ({
          key: newKey(),
          question_text: q.question_text ?? "",
          options: q.options ?? ["", ""],
          correct_index: q.correct_index ?? 0,
          marks: q.marks ?? 1,
          topic: q.topic ?? "",
          explanation: q.explanation ?? "",
        }));
        questionsRef.current = mapped;
        setQuestions(mapped);
      })
      .catch((e) => { if (alive) setLoadError(apiErrorMessage(e, "Couldn't load this test.")); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  // Questions are replaced wholesale by the API, so only send complete ones —
  // a half-typed question would be rejected and fail the whole autosave.
  const saveQuestions = React.useCallback(() => {
    const complete = questionsRef.current.filter(isComplete);
    if (complete.length === 0) { dirty.current = false; setSaveState("idle"); return Promise.resolve(); }
    setSaveState("saving");
    return api
      .put(`/api/mcq/tests/${id}/questions`, {
        questions: complete.map(({ question_text, options, correct_index, marks, topic, explanation }) => ({
          question_text, options, correct_index, marks, topic, explanation,
        })),
      })
      .then(() => { dirty.current = false; setSaveState("saved"); })
      .catch((e) => {
        setSaveState("error");
        toast(apiErrorMessage(e, "Couldn't save the questions."), { severity: "error" });
      });
  }, [id, toast]);

  const editQuestion = (key: string, make: (cur: Question) => Partial<Question>) => {
    const next = questionsRef.current.map((q) => (q.key === key ? { ...q, ...make(q) } : q));
    questionsRef.current = next;
    setQuestions(next);
    dirty.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveQuestions, 900);
  };

  const setQuestionList = (next: Question[]) => {
    questionsRef.current = next;
    setQuestions(next);
    dirty.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveQuestions, 900);
  };

  const reorder = (keys: string[]) => {
    const byKey = new Map(questionsRef.current.map((q) => [q.key, q]));
    setQuestionList(keys.map((k) => byKey.get(k)).filter(Boolean) as Question[]);
  };

  // Test metadata lives on its own endpoint, separate from the question list.
  const metaRef = React.useRef({ title: "", category: "aptitude", duration: 30 });
  metaRef.current = { title, category, duration };
  const metaTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveMeta = React.useCallback(() => {
    const m = metaRef.current;
    if (!m.title.trim()) return;           // the API requires a title
    setSaveState("saving");
    api
      .put(`/api/mcq/tests/${id}`, {
        title: m.title.trim(), category: m.category, duration_minutes: m.duration,
      })
      .then(() => setSaveState("saved"))
      .catch((e) => {
        setSaveState("error");
        toast(apiErrorMessage(e, "Couldn't save the test details."), { severity: "error" });
      });
  }, [id, toast]);

  const editMeta = (apply: () => void) => {
    apply();
    if (metaTimer.current) clearTimeout(metaTimer.current);
    metaTimer.current = setTimeout(saveMeta, 900);
  };

  React.useEffect(() => () => { if (metaTimer.current) clearTimeout(metaTimer.current); }, []);

  React.useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (dirty.current) saveQuestions();
  }, [saveQuestions]);

  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const completeQuestions = questions.filter(isComplete);
  const totalMarks = completeQuestions.reduce((s, q) => s + q.marks, 0);

  const togglePublish = async () => {
    setPublishing(true);
    setPublishError("");
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (dirty.current) await saveQuestions();
      const r = await api.patch(`/api/mcq/tests/${id}/publish`, { is_published: !isPublished });
      if (r.data?.success) {
        setIsPublished(r.data.data.is_published);
        toast(r.data.data.is_published ? "Published to students" : "Unpublished", { severity: "success" });
      }
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setPublishError(err?.response?.data?.error || apiErrorMessage(e, "Couldn't change the publish state."));
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return <Stack spacing={2}><Skeleton variant="rounded" height={40} width="40%" /><Skeleton variant="rounded" height={320} /></Stack>;
  }
  if (loadError) {
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => router.push("/faculty/mcq")}>Back</Button>}>
        {loadError}
      </Alert>
    );
  }

  const detailsStep: AuthoringStep = {
    label: "Details",
    hint: "Name the test and set how long students get.",
    blockedReason: title.trim() ? undefined : "Give the test a title",
    content: (
      <Stack spacing={2.5}>
        <TextField
          label="Title" required fullWidth size="small" value={title}
          placeholder="Quantitative Aptitude — Set 1"
          onChange={(e) => { const v = e.target.value; editMeta(() => setTitle(v)); }}
        />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            select label="Category" size="small" sx={{ width: { sm: 180 } }} value={category}
            onChange={(e) => { const v = e.target.value; editMeta(() => setCategory(v)); }}
          >
            {CATEGORIES.map((c) => <MenuItem key={c} value={c} sx={{ textTransform: "capitalize" }}>{c}</MenuItem>)}
          </TextField>
          <TextField
            label="Duration (minutes)" type="number" size="small" sx={{ width: 180 }} value={duration}
            onChange={(e) => { const v = Math.max(1, parseInt(e.target.value) || 30); editMeta(() => setDuration(v)); }}
          />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Changes here save automatically. Students see the duration as their time limit once the
          test is published.
        </Typography>
      </Stack>
    ),
  };

  const questionsStep: AuthoringStep = {
    label: "Questions",
    hint: "Drag by the handle to reorder. Only complete questions are saved — incomplete ones are outlined.",
    blockedReason: completeQuestions.length > 0 ? undefined : "Add at least one complete question",
    content: (
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
          <Typography variant="body2" color="text.secondary">
            {completeQuestions.length} of {questions.length} complete · {totalMarks} mark{totalMarks === 1 ? "" : "s"} total
          </Typography>
          <Button
            size="small" variant="outlined" startIcon={<AddIcon />}
            onClick={() => setQuestionList([...questionsRef.current, blankQuestion()])}
          >
            Add question
          </Button>
        </Stack>

        {questions.length === 0 ? (
          <Alert severity="info">No questions yet. Add the first one.</Alert>
        ) : (
          <Reorder.Group axis="y" values={questions.map((q) => q.key)} onReorder={reorder} style={{ padding: 0, margin: 0 }}>
            {questions.map((q, i) => (
              <QuestionCard
                key={q.key}
                q={q}
                index={i}
                total={questions.length}
                onChange={(make) => editQuestion(q.key, make)}
                onDelete={() => setQuestionList(questionsRef.current.filter((x) => x.key !== q.key))}
                onMove={(delta) => {
                  const cur = questionsRef.current;
                  const from = cur.findIndex((x) => x.key === q.key);
                  const to = from + delta;
                  if (from < 0 || to < 0 || to >= cur.length) return;
                  const next = [...cur];
                  [next[from], next[to]] = [next[to], next[from]];
                  setQuestionList(next);
                }}
              />
            ))}
          </Reorder.Group>
        )}
      </Stack>
    ),
  };

  const previewStep: AuthoringStep = {
    label: "Preview",
    hint: "This is what a student sees — answers and explanations are hidden from them until they submit.",
    content: (
      completeQuestions.length === 0 ? (
        <Alert severity="warning">Nothing to preview — no complete questions yet.</Alert>
      ) : (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="subtitle1" fontWeight={600}>{title || "Untitled test"}</Typography>
            <Chip size="small" label={category} sx={{ height: 20, fontSize: 10, textTransform: "uppercase" }} />
            <Chip size="small" label={`${duration} min`} sx={{ height: 20, fontSize: 10 }} />
            <Chip size="small" label={`${totalMarks} marks`} sx={{ height: 20, fontSize: 10 }} />
          </Stack>
          <Divider />
          {completeQuestions.map((q, i) => (
            <Box key={q.key}>
              <Typography variant="body2" fontWeight={500} sx={{ mb: 0.5 }}>
                {i + 1}. {q.question_text}
                <Typography component="span" variant="caption" color="text.secondary"> ({q.marks} mark{q.marks === 1 ? "" : "s"})</Typography>
              </Typography>
              <Stack spacing={0.25} sx={{ pl: 2 }}>
                {q.options.map((o, oi) => (
                  <Typography key={oi} variant="body2" color="text.secondary">
                    {String.fromCharCode(65 + oi)}. {o}
                  </Typography>
                ))}
              </Stack>
              <Typography variant="caption" sx={{ pl: 2, color: "success.main" }}>
                Correct: {String.fromCharCode(65 + q.correct_index)}
                {q.topic ? ` · topic: ${q.topic}` : ""}
              </Typography>
            </Box>
          ))}
        </Stack>
      )
    ),
  };

  const publishStep: AuthoringStep = {
    label: "Publish",
    hint: isPublished
      ? "This test is live. Students can attempt it now."
      : "Students cannot see this test until you publish it.",
    content: (
      <Stack spacing={2}>
        <Stack spacing={1}>
          <CheckLine ok={!!title.trim()}>Title</CheckLine>
          <CheckLine ok={completeQuestions.length > 0}>
            {completeQuestions.length} complete question{completeQuestions.length === 1 ? "" : "s"}
          </CheckLine>
          <CheckLine ok={questions.length === completeQuestions.length}>
            {questions.length === completeQuestions.length
              ? "No incomplete questions"
              : `${questions.length - completeQuestions.length} incomplete question(s) will not be saved`}
          </CheckLine>
          <CheckLine ok={duration > 0}>Duration — {duration} minutes</CheckLine>
        </Stack>

        {publishError && <Alert severity="warning">{publishError}</Alert>}

        <Divider />
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip
            label={isPublished ? "Published" : "Draft"}
            sx={{
              fontWeight: 600,
              bgcolor: isPublished ? "successContainer" : "surfaceContainerHigh",
              color: isPublished ? "onSuccessContainer" : "onSurfaceVariant",
            }}
          />
          <Typography variant="body2" color="text.secondary">
            {isPublished ? "Listed in the student aptitude section." : "Hidden from students."}
          </Typography>
        </Stack>

        {!isPublished && completeQuestions.length === 0 && (
          <Alert severity="warning">
            <AlertTitle sx={{ fontSize: 14 }}>Not ready</AlertTitle>
            A test needs at least one complete question before it can be published.
          </Alert>
        )}
      </Stack>
    ),
  };

  const steps = [detailsStep, questionsStep, previewStep, publishStep];

  return (
    <AuthoringShell
      title={title || "Untitled test"}
      subtitle={`${category} · ${completeQuestions.length} question${completeQuestions.length === 1 ? "" : "s"} · ${duration} min`}
      statusChip={
        <Chip
          size="small"
          label={isPublished ? "Published" : "Draft"}
          sx={{
            height: 22, fontWeight: 600,
            bgcolor: isPublished ? "successContainer" : "surfaceContainerHigh",
            color: isPublished ? "onSuccessContainer" : "onSurfaceVariant",
          }}
        />
      }
      steps={steps}
      step={step}
      onStepChange={(n) => setStep(Math.max(0, Math.min(steps.length - 1, n)))}
      saveState={saveState}
      onRetrySave={saveQuestions}
      onExit={() => router.push("/faculty/mcq")}
      finalAction={
        <Tooltip title={isPublished || completeQuestions.length > 0 ? "" : "Add a complete question first"}>
          <span>
            <Button
              variant={isPublished ? "outlined" : "contained"}
              color={isPublished ? "warning" : "success"}
              startIcon={isPublished ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
              disabled={publishing || (!isPublished && completeQuestions.length === 0)}
              onClick={togglePublish}
            >
              {publishing ? "Working…" : isPublished ? "Unpublish" : "Publish to students"}
            </Button>
          </span>
        </Tooltip>
      }
    />
  );
}
