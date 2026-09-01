"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Checkbox from "@mui/material/Checkbox";
import Skeleton from "@mui/material/Skeleton";
import Divider from "@mui/material/Divider";
import Tooltip from "@mui/material/Tooltip";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import {
  CloseIcon, GroupsOutlinedIcon, DescriptionOutlinedIcon, ExpandLessIcon, ExpandMoreIcon,
  DeleteOutlineIcon, AddIcon, CodeOutlinedIcon, QuizOutlinedIcon, VisibilityOutlinedIcon, VisibilityOffOutlinedIcon,
} from "@/components/ui/icons";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/components/feedback/ToastProvider";
import { useConfirm } from "@/components/feedback/ConfirmProvider";
import { SearchField } from "@/components/ui/SearchField";
import { EmptyState } from "@/components/ui/States";
import { AuthoringShell, CheckLine, type SaveState, type AuthoringStep } from "@/components/faculty/AuthoringShell";
import {
  McqQuestionEditor, type McqQuestion, newQuestionKey, isMcqQuestionComplete,
} from "@/components/faculty/McqQuestionEditor";

interface PickableProblem { id: string; title: string; difficulty: string; tags: string[]; status?: string }
interface ClassOption { id: string; name: string; department: string | null; section: string | null; member_count: number }

interface RawQuestion {
  id: string; question_text: string; options: string[]; correct_index: number; marks: number;
  topic: string | null; explanation: string | null;
}
interface RawProblem { id: string; title: string; difficulty: string | null }
interface RawSection {
  id: string; title: string; type: "mcq" | "coding"; order: number; instructions: string | null;
  marks_per_question: number; negative_marking: number | null; duration_minutes: number | null;
  questions?: RawQuestion[]; problems?: RawProblem[];
}

// datetime-local needs `YYYY-MM-DDTHH:mm` in local time.
function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── One section card: owns its own content (questions or problems) and
// autosaves it independently of the parent, the same "debounce, then PUT"
// pattern the MCQ and assignment builders already use — just scoped per
// section instead of per whole test. ────────────────────────────────────────
function SectionCard({
  examId, section, index, total, allProblems, onDeleted, onMove, onSaveStateChange, onContentCountChange,
}: {
  examId: string;
  section: RawSection;
  index: number;
  total: number;
  allProblems: PickableProblem[];
  onDeleted: () => void;
  onMove: (delta: number) => void;
  onSaveStateChange: (s: SaveState) => void;
  onContentCountChange: (count: number) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();

  const [title, setTitle] = React.useState(section.title);
  const [instructions, setInstructions] = React.useState(section.instructions ?? "");
  const [marksPerQuestion, setMarksPerQuestion] = React.useState(section.marks_per_question ?? 1);
  const [negativeMarking, setNegativeMarking] = React.useState<string>(section.negative_marking != null ? String(section.negative_marking) : "");

  const [questions, setQuestions] = React.useState<McqQuestion[]>(
    () => (section.questions ?? []).map((q) => ({
      key: newQuestionKey(), question_text: q.question_text, options: q.options,
      correct_index: q.correct_index, marks: q.marks, topic: q.topic ?? "", explanation: q.explanation ?? "",
    })),
  );
  const [problemIds, setProblemIds] = React.useState<string[]>(() => (section.problems ?? []).map((p) => p.id));
  const [search, setSearch] = React.useState("");
  const [expanded, setExpanded] = React.useState(true);

  const questionsRef = React.useRef(questions);
  const problemIdsRef = React.useRef(problemIds);
  const metaTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionsTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const problemsTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // saveMeta is scheduled via setTimeout from inside an event handler, so it must
  // read the latest field values through a ref rather than closing over the state
  // variables directly — otherwise a burst of edits (e.g. typing a whole title)
  // schedules a callback still bound to the value from before the burst started,
  // and the save silently reverts to stale data. Same ref-composition pattern as
  // the MCQ and assignment builders' own meta autosave.
  const metaRef = React.useRef({ title, instructions, marksPerQuestion, negativeMarking });
  React.useEffect(() => {
    metaRef.current = { title, instructions, marksPerQuestion, negativeMarking };
  });

  React.useEffect(() => {
    const count = section.type === "mcq" ? questions.filter(isMcqQuestionComplete).length : problemIds.length;
    onContentCountChange(count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveMeta = React.useCallback(() => {
    const m = metaRef.current;
    if (!m.title.trim()) return;
    onSaveStateChange("saving");
    const neg = m.negativeMarking.trim() === "" ? null : Math.max(parseFloat(m.negativeMarking) || 0, 0);
    api.put(`/api/exams/${examId}/sections/${section.id}`, {
      title: m.title.trim(), instructions: m.instructions.trim() || null,
      marks_per_question: m.marksPerQuestion, negative_marking: neg,
    })
      .then(() => onSaveStateChange("saved"))
      .catch((e) => { onSaveStateChange("error"); toast(apiErrorMessage(e, "Couldn't save the section."), { severity: "error" }); });
  }, [examId, section.id, onSaveStateChange, toast]);

  const editMeta = (apply: () => void) => {
    apply();
    if (metaTimer.current) clearTimeout(metaTimer.current);
    metaTimer.current = setTimeout(saveMeta, 900);
  };

  const saveQuestions = React.useCallback((next: McqQuestion[]) => {
    const complete = next.filter(isMcqQuestionComplete);
    onContentCountChange(complete.length);
    if (complete.length === 0) return;
    onSaveStateChange("saving");
    api.put(`/api/exams/${examId}/sections/${section.id}/questions`, {
      questions: complete.map(({ question_text, options, correct_index, marks, topic, explanation }) => ({
        question_text, options, correct_index, marks, topic, explanation,
      })),
    })
      .then(() => onSaveStateChange("saved"))
      .catch((e) => { onSaveStateChange("error"); toast(apiErrorMessage(e, "Couldn't save the questions."), { severity: "error" }); });
  }, [examId, section.id, onSaveStateChange, onContentCountChange, toast]);

  const changeQuestions = (next: McqQuestion[]) => {
    questionsRef.current = next;
    setQuestions(next);
    if (questionsTimer.current) clearTimeout(questionsTimer.current);
    questionsTimer.current = setTimeout(() => saveQuestions(questionsRef.current), 900);
  };

  const saveProblems = React.useCallback((next: string[]) => {
    onContentCountChange(next.length);
    onSaveStateChange("saving");
    api.put(`/api/exams/${examId}/sections/${section.id}/problems`, { problem_ids: next })
      .then(() => onSaveStateChange("saved"))
      .catch((e) => { onSaveStateChange("error"); toast(apiErrorMessage(e, "Couldn't save the problems."), { severity: "error" }); });
  }, [examId, section.id, onSaveStateChange, onContentCountChange, toast]);

  const toggleProblem = (pid: string) => {
    const next = problemIds.includes(pid) ? problemIds.filter((x) => x !== pid) : [...problemIds, pid];
    problemIdsRef.current = next;
    setProblemIds(next);
    if (problemsTimer.current) clearTimeout(problemsTimer.current);
    problemsTimer.current = setTimeout(() => saveProblems(problemIdsRef.current), 500);
  };

  React.useEffect(() => () => {
    if (metaTimer.current) clearTimeout(metaTimer.current);
    if (questionsTimer.current) clearTimeout(questionsTimer.current);
    if (problemsTimer.current) clearTimeout(problemsTimer.current);
  }, []);

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete section?",
      description: `Delete "${title || "this section"}"? This removes its ${section.type === "mcq" ? "questions" : "attached problems"}.`,
      confirmLabel: "Delete", destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/exams/${examId}/sections/${section.id}`);
      onDeleted();
    } catch (e) {
      toast(apiErrorMessage(e, "Couldn't delete the section."), { severity: "error" });
    }
  };

  const byId = React.useMemo(() => new Map(allProblems.map((p) => [p.id, p])), [allProblems]);
  const selectedProblems = problemIds.map((pid) => byId.get(pid)).filter(Boolean) as PickableProblem[];
  const publishable = allProblems.filter((p) => p.status !== "draft");
  const visibleProblems = publishable.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.title.toLowerCase().includes(q) || (p.tags ?? []).some((t) => t.toLowerCase().includes(q));
  });

  const completeCount = section.type === "mcq" ? questions.filter(isMcqQuestionComplete).length : problemIds.length;

  return (
    <Card variant="outlined" sx={{ borderColor: completeCount > 0 ? "outlineVariant" : "warning.main" }}>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: expanded ? 2 : 0 }} flexWrap="wrap" useFlexGap>
          <Tooltip title={expanded ? "Collapse section" : "Expand section"}>
            <IconButton size="small" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? "Collapse section" : "Expand section"}>
              {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          {section.type === "mcq" ? <QuizOutlinedIcon fontSize="small" sx={{ color: "primary.main" }} /> : <CodeOutlinedIcon fontSize="small" sx={{ color: "primary.main" }} />}
          <TextField
            variant="standard" value={title} placeholder="Section title"
            onChange={(e) => { const v = e.target.value; editMeta(() => setTitle(v)); }}
            sx={{ minWidth: 160, "& .MuiInput-input": { fontWeight: 600 } }}
          />
          <Chip size="small" label={section.type} sx={{ height: 18, fontSize: 10, textTransform: "uppercase" }} />
          {completeCount === 0 && <Chip label="Empty" size="small" sx={{ height: 18, fontSize: 10, bgcolor: "warningContainer", color: "onWarningContainer" }} />}
          <Box sx={{ flex: 1 }} />
          <TextField
            label="Marks/Q" type="number" size="small" sx={{ width: 90 }} value={marksPerQuestion}
            onChange={(e) => { const v = Math.max(1, parseInt(e.target.value) || 1); editMeta(() => setMarksPerQuestion(v)); }}
          />
          {section.type === "mcq" && (
            <TextField
              label="Negative" type="number" size="small" sx={{ width: 100 }} value={negativeMarking}
              placeholder="0" helperText="" slotProps={{ input: { inputProps: { step: 0.25, min: 0 } } }}
              onChange={(e) => { const v = e.target.value; editMeta(() => setNegativeMarking(v)); }}
            />
          )}
          <Tooltip title="Move section up">
            <span>
              <IconButton size="small" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move section ${index + 1} up`}>
                <ExpandLessIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Move section down">
            <span>
              <IconButton size="small" disabled={index === total - 1} onClick={() => onMove(1)} aria-label={`Move section ${index + 1} down`}>
                <ExpandMoreIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Delete section">
            <IconButton size="small" color="error" onClick={handleDelete} aria-label={`Delete section ${title}`}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        {expanded && (
          <Stack spacing={2}>
            <TextField
              size="small" fullWidth placeholder="Instructions shown to students for this section (optional)"
              value={instructions}
              onChange={(e) => { const v = e.target.value; editMeta(() => setInstructions(v)); }}
            />
            <Divider />
            {section.type === "mcq" ? (
              <McqQuestionEditor questions={questions} onChange={changeQuestions} defaultMarks={marksPerQuestion} />
            ) : (
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
                <Box>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="overline" color="text.secondary">Available problems</Typography>
                    <SearchField value={search} onChange={setSearch} placeholder="Title or tag" />
                  </Stack>
                  <Box sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: 2, maxHeight: 300, overflowY: "auto" }}>
                    {visibleProblems.length === 0 ? (
                      <EmptyState
                        icon={<DescriptionOutlinedIcon />}
                        title={publishable.length === 0 ? "No published problems" : "Nothing matches that search"}
                      />
                    ) : visibleProblems.map((p) => {
                      const chosen = problemIds.includes(p.id);
                      return (
                        <Stack
                          key={p.id} direction="row" alignItems="center" spacing={1} onClick={() => toggleProblem(p.id)}
                          sx={{
                            px: 1, py: 0.75, cursor: "pointer", borderBottom: "1px solid", borderColor: "outlineVariant",
                            "&:last-of-type": { borderBottom: 0 }, bgcolor: chosen ? "primaryContainer" : "transparent",
                          }}
                        >
                          <Checkbox size="small" checked={chosen} tabIndex={-1} />
                          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>{p.title}</Typography>
                          <Chip label={p.difficulty} size="small" sx={{ height: 18, fontSize: 10, textTransform: "capitalize", flexShrink: 0 }} />
                        </Stack>
                      );
                    })}
                  </Box>
                </Box>
                <Box>
                  <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                    In this section ({problemIds.length})
                  </Typography>
                  {selectedProblems.length === 0 ? (
                    <Box sx={{ border: "1px dashed", borderColor: "outlineVariant", borderRadius: 2 }}>
                      <EmptyState icon={<DescriptionOutlinedIcon />} title="Nothing selected yet" description="Pick problems on the left." />
                    </Box>
                  ) : (
                    <Stack spacing={0.75}>
                      {selectedProblems.map((p) => (
                        <Stack key={p.id} direction="row" alignItems="center" spacing={1} sx={{ px: 1, py: 0.75, borderRadius: 2, border: "1px solid", borderColor: "outlineVariant" }}>
                          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>{p.title}</Typography>
                          <Chip label={p.difficulty} size="small" sx={{ height: 18, fontSize: 10, textTransform: "capitalize" }} />
                          <IconButton size="small" onClick={() => toggleProblem(p.id)} aria-label={`Remove ${p.title}`}><CloseIcon fontSize="small" /></IconButton>
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </Box>
              </Box>
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

export default function ExamBuilderPage() {
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
  const [description, setDescription] = React.useState("");
  const [windowStart, setWindowStart] = React.useState("");
  const [windowEnd, setWindowEnd] = React.useState("");
  const [duration, setDuration] = React.useState(60);
  const [generalInstructions, setGeneralInstructions] = React.useState("");
  const [negativeMarkingDefault, setNegativeMarkingDefault] = React.useState(0);
  const [classIds, setClassIds] = React.useState<string[]>([]);
  const [isPublished, setIsPublished] = React.useState(false);

  const [sections, setSections] = React.useState<RawSection[]>([]);
  const [contentCounts, setContentCounts] = React.useState<Record<string, number>>({});
  const [problems, setProblems] = React.useState<PickableProblem[]>([]);
  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [addingSection, setAddingSection] = React.useState(false);

  const load = React.useCallback(() => {
    let alive = true;
    Promise.all([
      api.get(`/api/exams/${id}`),
      api.get("/api/faculty/problems"),
      api.get("/api/classrooms"),
    ])
      .then(([e, p, c]) => {
        if (!alive || !e.data?.success) return;
        const { exam, sections: secs } = e.data.data;
        setTitle(exam.title ?? "");
        setDescription(exam.description ?? "");
        setWindowStart(exam.window_start ? toLocalInput(exam.window_start) : "");
        setWindowEnd(exam.window_end ? toLocalInput(exam.window_end) : "");
        setDuration(exam.duration_minutes ?? 60);
        setGeneralInstructions(exam.general_instructions ?? "");
        setNegativeMarkingDefault(exam.negative_marking_default ?? 0);
        setClassIds(exam.classroom_ids ?? []);
        setIsPublished(!!exam.is_published);
        setSections((secs ?? []).sort((a: RawSection, b: RawSection) => a.order - b.order));
        const counts: Record<string, number> = {};
        for (const s of secs ?? []) {
          counts[s.id] = s.type === "mcq" ? (s.questions ?? []).filter((q: RawQuestion) => q.question_text?.trim()).length : (s.problems ?? []).length;
        }
        setContentCounts(counts);
        if (p.data?.success) setProblems(p.data.data);
        if (c.data?.success) setClasses(c.data.data);
      })
      .catch((e) => { if (alive) setLoadError(apiErrorMessage(e, "Couldn't load this exam.")); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  React.useEffect(() => load(), [load]);

  // Details autosave — same debounce-on-edit pattern as the meta fields in the
  // MCQ/assignment builders.
  const metaRef = React.useRef({ title, description, windowStart, windowEnd, duration, generalInstructions, negativeMarkingDefault, classIds });
  React.useEffect(() => {
    metaRef.current = { title, description, windowStart, windowEnd, duration, generalInstructions, negativeMarkingDefault, classIds };
  });
  const metaTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [metaError, setMetaError] = React.useState("");

  const saveMeta = React.useCallback(() => {
    const m = metaRef.current;
    if (!m.title.trim() || !m.windowStart || !m.windowEnd) return;
    setSaveState("saving");
    setMetaError("");
    api.put(`/api/exams/${id}`, {
      title: m.title.trim(),
      description: m.description.trim() || null,
      window_start: new Date(m.windowStart).toISOString(),
      window_end: new Date(m.windowEnd).toISOString(),
      duration_minutes: m.duration,
      general_instructions: m.generalInstructions.trim() || null,
      negative_marking_default: m.negativeMarkingDefault,
      classroom_ids: m.classIds,
    })
      .then(() => setSaveState("saved"))
      .catch((e) => {
        setSaveState("error");
        setMetaError(apiErrorMessage(e, "Couldn't save the exam details."));
      });
  }, [id]);

  const editMeta = (apply: () => void) => {
    apply();
    if (metaTimer.current) clearTimeout(metaTimer.current);
    metaTimer.current = setTimeout(saveMeta, 900);
  };

  React.useEffect(() => () => { if (metaTimer.current) clearTimeout(metaTimer.current); }, []);

  const addSection = async (type: "mcq" | "coding") => {
    setAddingSection(true);
    try {
      const r = await api.post(`/api/exams/${id}/sections`, {
        title: type === "mcq" ? "New Section" : "Coding", type, marks_per_question: type === "mcq" ? 1 : 10,
      });
      if (r.data?.success) {
        const sid = r.data.data.id;
        setSections((prev) => [...prev, {
          id: sid, title: type === "mcq" ? "New Section" : "Coding", type, order: prev.length,
          instructions: null, marks_per_question: type === "mcq" ? 1 : 10, negative_marking: null, duration_minutes: null,
          questions: [], problems: [],
        }]);
        setContentCounts((c) => ({ ...c, [sid]: 0 }));
      }
    } catch (e) {
      toast(apiErrorMessage(e, "Couldn't add the section."), { severity: "error" });
    } finally {
      setAddingSection(false);
    }
  };

  const moveSection = async (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= sections.length) return;
    const next = [...sections];
    [next[index], next[to]] = [next[to], next[index]];
    setSections(next);
    try {
      await api.put(`/api/exams/${id}/sections/reorder`, { section_ids: next.map((s) => s.id) });
    } catch (e) {
      toast(apiErrorMessage(e, "Couldn't save the new order."), { severity: "error" });
    }
  };

  const removeSection = (sid: string) => {
    setSections((prev) => prev.filter((s) => s.id !== sid));
    setContentCounts((c) => { const next = { ...c }; delete next[sid]; return next; });
    toast("Section deleted", { severity: "success" });
  };

  if (loading) {
    return <Stack spacing={2}><Skeleton variant="rounded" height={40} width="40%" /><Skeleton variant="rounded" height={320} /></Stack>;
  }
  if (loadError) {
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => router.push("/faculty/exams")}>Back</Button>}>
        {loadError}
      </Alert>
    );
  }

  const emptySections = sections.filter((s) => (contentCounts[s.id] ?? 0) === 0);
  const targetedStudents = classIds.reduce((sum, cid) => sum + (classes.find((c) => c.id === cid)?.member_count ?? 0), 0);

  const detailsStep: AuthoringStep = {
    label: "Details",
    hint: "Name it, set the window students can start within, and how long they get once they start.",
    blockedReason: !title.trim() ? "Give the exam a title" : (!windowStart || !windowEnd) ? "Set both a start and end for the window" : undefined,
    content: (
      <Stack spacing={2.5}>
        <TextField
          label="Title" required fullWidth size="small" value={title}
          placeholder="Semester Assessment — Set 1"
          onChange={(e) => { const v = e.target.value; editMeta(() => setTitle(v)); }}
        />
        <TextField
          label="Description (optional)" fullWidth size="small" multiline minRows={2} value={description}
          onChange={(e) => { const v = e.target.value; editMeta(() => setDescription(v)); }}
        />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label="Opens" required type="datetime-local" size="small" fullWidth value={windowStart}
            onChange={(e) => { const v = e.target.value; editMeta(() => setWindowStart(v)); }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Closes" required type="datetime-local" size="small" fullWidth value={windowEnd}
            onChange={(e) => { const v = e.target.value; editMeta(() => setWindowEnd(v)); }}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label="Duration once started (minutes)" type="number" size="small" sx={{ width: 260 }} value={duration}
            onChange={(e) => { const v = Math.max(1, parseInt(e.target.value) || 60); editMeta(() => setDuration(v)); }}
          />
          <TextField
            label="Default negative marking" type="number" size="small" sx={{ width: 260 }} value={negativeMarkingDefault}
            helperText="Applied to MCQ sections that don't set their own"
            onChange={(e) => { const v = Math.max(0, parseFloat(e.target.value) || 0); editMeta(() => setNegativeMarkingDefault(v)); }}
          />
        </Stack>
        <TextField
          label="General instructions shown before starting (optional)" fullWidth size="small" multiline minRows={3} value={generalInstructions}
          onChange={(e) => { const v = e.target.value; editMeta(() => setGeneralInstructions(v)); }}
        />
        {metaError && <Alert severity="error">{metaError}</Alert>}
      </Stack>
    ),
  };

  const sectionsStep: AuthoringStep = {
    label: "Sections",
    hint: "Add sections in the order students will see them. A section's type can't be changed after it's created.",
    blockedReason: sections.length === 0 ? "Add at least one section" : undefined,
    content: (
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button size="small" variant="outlined" startIcon={<AddIcon />} disabled={addingSection} onClick={() => addSection("mcq")}>Add MCQ section</Button>
          <Button size="small" variant="outlined" startIcon={<AddIcon />} disabled={addingSection} onClick={() => addSection("coding")}>Add coding section</Button>
        </Stack>
        {sections.length === 0 ? (
          <Alert severity="info">No sections yet. Add the first one.</Alert>
        ) : (
          <Stack spacing={2}>
            {sections.map((s, i) => (
              <SectionCard
                key={s.id}
                examId={id}
                section={s}
                index={i}
                total={sections.length}
                allProblems={problems}
                onDeleted={() => removeSection(s.id)}
                onMove={(delta) => moveSection(i, delta)}
                onSaveStateChange={setSaveState}
                onContentCountChange={(count) => setContentCounts((c) => ({ ...c, [s.id]: count }))}
              />
            ))}
          </Stack>
        )}
      </Stack>
    ),
  };

  const classesStep: AuthoringStep = {
    label: "Who takes it",
    hint: "Pick the classes this exam is for. Selecting none means every student sees it.",
    content: (
      <Stack spacing={2}>
        {classIds.length === 0 && (
          <Alert severity="info">No class selected — <strong>every student</strong> will see this exam.</Alert>
        )}
        {classes.length === 0 ? (
          <EmptyState icon={<GroupsOutlinedIcon />} title="No classes yet" description="Create a class to target this exam at it." />
        ) : (
          <Box sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: 2, maxHeight: 340, overflowY: "auto" }}>
            {classes.map((c) => {
              const chosen = classIds.includes(c.id);
              return (
                <Stack
                  key={c.id} direction="row" alignItems="center" spacing={1}
                  onClick={() => editMeta(() => setClassIds((prev) => (chosen ? prev.filter((x) => x !== c.id) : [...prev, c.id])))}
                  sx={{
                    px: 1, py: 0.75, cursor: "pointer", borderBottom: "1px solid", borderColor: "outlineVariant",
                    "&:last-of-type": { borderBottom: 0 }, bgcolor: chosen ? "primaryContainer" : "transparent",
                  }}
                >
                  <Checkbox size="small" checked={chosen} tabIndex={-1} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap>{c.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[c.department, c.section && `Sec ${c.section}`].filter(Boolean).join(" · ") || "No dept/section"}
                    </Typography>
                  </Box>
                  <Chip icon={<GroupsOutlinedIcon />} label={c.member_count} size="small" sx={{ height: 20, fontSize: 11, flexShrink: 0 }} />
                </Stack>
              );
            })}
          </Box>
        )}
      </Stack>
    ),
  };

  const previewStep: AuthoringStep = {
    label: "Preview",
    hint: "A quick check before publishing — this is not exactly what students see, just a summary.",
    content: (
      <Stack spacing={2}>
        <Stack spacing={1}>
          <CheckLine ok={!!title.trim()}>Title — {title || "not set"}</CheckLine>
          <CheckLine ok={!!windowStart && !!windowEnd}>
            Window — {windowStart && windowEnd ? `${new Date(windowStart).toLocaleString()} → ${new Date(windowEnd).toLocaleString()}` : "not set"}
          </CheckLine>
          <CheckLine ok={sections.length > 0}>{sections.length} section{sections.length === 1 ? "" : "s"}</CheckLine>
          <CheckLine ok={emptySections.length === 0}>
            {emptySections.length === 0 ? "Every section has content" : `${emptySections.length} section(s) still empty: ${emptySections.map((s) => s.title).join(", ")}`}
          </CheckLine>
          <CheckLine ok>
            {classIds.length === 0 ? "Visible to every student" : `${classIds.length} class${classIds.length === 1 ? "" : "es"} · ~${targetedStudents} student${targetedStudents === 1 ? "" : "s"}`}
          </CheckLine>
        </Stack>
        <Divider />
        <Stack spacing={1}>
          {sections.map((s, i) => (
            <Stack key={s.id} direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" sx={{ minWidth: 24 }}>{i + 1}.</Typography>
              <Typography variant="body2" sx={{ flex: 1 }}>{s.title}</Typography>
              <Chip size="small" label={s.type} sx={{ height: 18, fontSize: 10, textTransform: "uppercase" }} />
              <Typography variant="caption" color="text.secondary">
                {contentCounts[s.id] ?? 0} {s.type === "mcq" ? "question" : "problem"}{(contentCounts[s.id] ?? 0) === 1 ? "" : "s"} · {s.marks_per_question} mark{s.marks_per_question === 1 ? "" : "s"} each
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Stack>
    ),
  };

  const publishStep: AuthoringStep = {
    label: "Publish",
    hint: isPublished ? "This exam is live. Students can start it within the window." : "Students cannot see this exam until you publish it.",
    content: (
      <Stack spacing={2}>
        <Stack spacing={1}>
          <CheckLine ok={!!title.trim()}>Title</CheckLine>
          <CheckLine ok={sections.length > 0}>At least one section</CheckLine>
          <CheckLine ok={emptySections.length === 0}>Every section has content</CheckLine>
        </Stack>
        {publishError && <Alert severity="warning">{publishError}</Alert>}
        <Divider />
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip
            label={isPublished ? "Published" : "Draft"}
            sx={{ fontWeight: 600, bgcolor: isPublished ? "successContainer" : "surfaceContainerHigh", color: isPublished ? "onSuccessContainer" : "onSurfaceVariant" }}
          />
          <Typography variant="body2" color="text.secondary">
            {isPublished ? "Listed for targeted students within the window." : "Hidden from students."}
          </Typography>
        </Stack>
        {!isPublished && (sections.length === 0 || emptySections.length > 0) && (
          <Alert severity="warning">
            <AlertTitle sx={{ fontSize: 14 }}>Not ready</AlertTitle>
            Every section needs content before this exam can be published.
          </Alert>
        )}
      </Stack>
    ),
  };

  const steps = [detailsStep, sectionsStep, classesStep, previewStep, publishStep];
  const canPublish = sections.length > 0 && emptySections.length === 0;

  const togglePublish = async () => {
    setPublishing(true);
    setPublishError("");
    try {
      const r = await api.patch(`/api/exams/${id}/publish`, { is_published: !isPublished });
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

  return (
    <AuthoringShell
      title={title || "Untitled exam"}
      subtitle={`${sections.length} section${sections.length === 1 ? "" : "s"} · ${duration} min · ${classIds.length === 0 ? "all students" : `${classIds.length} class${classIds.length === 1 ? "" : "es"}`}`}
      statusChip={
        <Chip
          size="small" label={isPublished ? "Published" : "Draft"}
          sx={{ height: 22, fontWeight: 600, bgcolor: isPublished ? "successContainer" : "surfaceContainerHigh", color: isPublished ? "onSuccessContainer" : "onSurfaceVariant" }}
        />
      }
      steps={steps}
      step={step}
      onStepChange={(n) => setStep(Math.max(0, Math.min(steps.length - 1, n)))}
      saveState={saveState}
      onExit={() => router.push("/faculty/exams")}
      finalAction={
        <Tooltip title={canPublish || isPublished ? "" : "Every section needs content first"}>
          <span>
            <Button
              variant={isPublished ? "outlined" : "contained"}
              color={isPublished ? "warning" : "success"}
              startIcon={isPublished ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
              disabled={publishing || (!isPublished && !canPublish)}
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
