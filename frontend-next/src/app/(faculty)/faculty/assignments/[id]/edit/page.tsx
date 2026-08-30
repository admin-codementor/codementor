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
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Skeleton from "@mui/material/Skeleton";
import Divider from "@mui/material/Divider";
import Tooltip from "@mui/material/Tooltip";
import {
  CloseIcon, DragHandleIcon, GroupsOutlinedIcon, DescriptionOutlinedIcon, ShieldOutlinedIcon,
  ExpandLessIcon, ExpandMoreIcon,
} from "@/components/ui/icons";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/components/feedback/ToastProvider";
import { SearchField } from "@/components/ui/SearchField";
import { EmptyState } from "@/components/ui/States";
import { AuthoringShell, CheckLine, type SaveState, type AuthoringStep } from "@/components/faculty/AuthoringShell";

interface PickableProblem { id: string; title: string; difficulty: string; tags: string[]; status?: string }
interface ClassOption { id: string; name: string; department: string | null; section: string | null; member_count: number }

// One selected problem row. Drag is handle-only so the row's own buttons stay
// clickable and a stray drag can't reorder the paper by accident.
//
// The up/down buttons are not a nicety: drag-and-drop is unusable with a keyboard
// or a screen reader, so ordering would otherwise be mouse-only. They also give a
// dependable path on touch devices where a drag can be swallowed by scrolling.
function SelectedRow({
  problem, index, total, onRemove, onMove,
}: {
  problem: PickableProblem; index: number; total: number;
  onRemove: () => void; onMove: (delta: number) => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={problem.id}
      dragListener={false}
      dragControls={controls}
      style={{ listStyle: "none" }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{
          px: 1, py: 0.75, mb: 0.75, borderRadius: 2, border: "1px solid",
          borderColor: "outlineVariant", bgcolor: "background.paper",
        }}
      >
        <Box
          onPointerDown={(e) => controls.start(e)}
          sx={{ cursor: "grab", display: "flex", color: "text.disabled", touchAction: "none" }}
          aria-label={`Reorder ${problem.title}`}
          role="button"
        >
          <DragHandleIcon fontSize="small" />
        </Box>
        <Typography variant="caption" sx={{ width: 20, color: "text.secondary" }}>{index + 1}</Typography>
        <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>{problem.title}</Typography>
        <Chip label={problem.difficulty} size="small" sx={{ height: 18, fontSize: 10, textTransform: "capitalize" }} />
        <IconButton size="small" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${problem.title} up`}>
          <ExpandLessIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" disabled={index === total - 1} onClick={() => onMove(1)} aria-label={`Move ${problem.title} down`}>
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={onRemove} aria-label={`Remove ${problem.title}`}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>
    </Reorder.Item>
  );
}

export default function AssignmentBuilderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const id = params.id;

  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [step, setStep] = React.useState(0);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState("");

  const [title, setTitle] = React.useState("");
  const [deadline, setDeadline] = React.useState("");
  const [isExam, setIsExam] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [classIds, setClassIds] = React.useState<string[]>([]);

  const [problems, setProblems] = React.useState<PickableProblem[]>([]);
  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [search, setSearch] = React.useState("");

  // `/assignments/new/edit` builds locally and POSTs on save. An assignment needs
  // at least one problem to exist at all, so pre-creating an empty shell (the way
  // problem authoring does) would just litter the list with unusable rows.
  const isNew = id === "new";

  React.useEffect(() => {
    let alive = true;
    Promise.all([
      isNew ? Promise.resolve(null) : api.get(`/api/faculty/assignments/${id}`),
      api.get("/api/faculty/problems"),
      api.get("/api/classrooms"),
    ])
      .then(([a, p, c]) => {
        if (!alive) return;
        if (a?.data?.success) {
          const d = a.data.data;
          setTitle(d.title ?? "");
          setDeadline(d.deadline ? toLocalInput(d.deadline) : "");
          setIsExam(!!d.is_exam);
          setSelectedIds((d.problems ?? []).map((x: { id: string }) => x.id));
          setClassIds(d.classroom_ids ?? []);
        }
        if (p.data?.success) setProblems(p.data.data);
        if (c.data?.success) setClasses(c.data.data);
      })
      .catch((e) => { if (alive) setLoadError(apiErrorMessage(e, "Couldn't load this assignment.")); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id, isNew]);

  const byId = React.useMemo(() => new Map(problems.map((p) => [p.id, p])), [problems]);
  const selectedProblems = selectedIds.map((pid) => byId.get(pid)).filter(Boolean) as PickableProblem[];

  // Only published problems can be assigned — a draft 404s for students, and the
  // API rejects it, so it must not be offerable here either.
  const publishable = problems.filter((p) => p.status !== "draft");
  const visible = publishable.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.title.toLowerCase().includes(q) || (p.tags ?? []).some((t) => t.toLowerCase().includes(q));
  });

  const save = React.useCallback(async () => {
    setSaving(true);
    setSaveState("saving");
    setSaveError("");
    try {
      const payload = {
        title: title.trim(),
        deadline: deadline ? new Date(deadline).toISOString() : "",
        problem_ids: selectedIds,
        classroom_ids: classIds,
        allowed_cidrs: [],
        is_exam: isExam,
      };
      if (isNew) await api.post("/api/faculty/assignments", payload);
      else await api.put(`/api/faculty/assignments/${id}`, payload);
      setSaveState("saved");
      return true;
    } catch (e) {
      setSaveState("error");
      const err = e as { response?: { data?: { error?: string } } };
      setSaveError(err?.response?.data?.error || apiErrorMessage(e, "Couldn't save the assignment."));
      return false;
    } finally {
      setSaving(false);
    }
  }, [id, title, deadline, selectedIds, classIds, isExam]);

  if (loading) {
    return <Stack spacing={2}><Skeleton variant="rounded" height={40} width="40%" /><Skeleton variant="rounded" height={320} /></Stack>;
  }
  if (loadError) {
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => router.push("/faculty/dashboard")}>Back</Button>}>
        {loadError}
      </Alert>
    );
  }

  const detailsStep: AuthoringStep = {
    label: "Details",
    hint: "Name it and set the deadline students will see.",
    blockedReason: !title.trim() ? "Give the assignment a title" : !deadline ? "Set a deadline" : undefined,
    content: (
      <Stack spacing={2.5}>
        <TextField
          label="Title" required fullWidth size="small" value={title}
          placeholder="Midterm Lab — Arrays & Strings"
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextField
          label="Deadline" required type="datetime-local" size="small" sx={{ maxWidth: 260 }}
          value={deadline} onChange={(e) => setDeadline(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Divider />
        <FormControlLabel
          control={<Checkbox checked={isExam} onChange={(e) => setIsExam(e.target.checked)} />}
          label={
            <Box>
              <Stack direction="row" spacing={0.75} alignItems="center">
                <ShieldOutlinedIcon fontSize="small" sx={{ color: isExam ? "warning.main" : "text.disabled" }} />
                <Typography variant="body2" fontWeight={500}>Proctored exam</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Enforces fullscreen and logs tab switches, copies and pastes. It also disables the AI
                tutor for the duration — students cannot ask for hints while sitting this.
              </Typography>
            </Box>
          }
        />
      </Stack>
    ),
  };

  const problemsStep: AuthoringStep = {
    label: "Problems",
    hint: "Drag to set the order students will see. Only published problems can be assigned.",
    blockedReason: selectedIds.length === 0 ? "Pick at least one problem" : undefined,
    content: (
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
        <Box>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="overline" color="text.secondary">Available</Typography>
            <SearchField value={search} onChange={setSearch} placeholder="Title or tag" />
          </Stack>
          <Box sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: 2, maxHeight: 340, overflowY: "auto" }}>
            {visible.length === 0 ? (
              <EmptyState
                icon={<DescriptionOutlinedIcon />}
                title={publishable.length === 0 ? "No published problems" : "Nothing matches that search"}
                description={publishable.length === 0 ? "Publish a problem first — drafts can't be assigned." : undefined}
              />
            ) : visible.map((p) => {
              const chosen = selectedIds.includes(p.id);
              return (
                <Stack
                  key={p.id} direction="row" alignItems="center" spacing={1}
                  onClick={() => setSelectedIds((prev) => (chosen ? prev.filter((x) => x !== p.id) : [...prev, p.id]))}
                  sx={{
                    px: 1, py: 0.75, cursor: "pointer", borderBottom: "1px solid", borderColor: "outlineVariant",
                    "&:last-of-type": { borderBottom: 0 },
                    bgcolor: chosen ? "primaryContainer" : "transparent",
                  }}
                >
                  <Checkbox size="small" checked={chosen} tabIndex={-1} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap>{p.title}</Typography>
                    {(p.tags ?? []).length > 0 && (
                      <Typography variant="caption" color="text.secondary" noWrap>{p.tags.slice(0, 4).join(" · ")}</Typography>
                    )}
                  </Box>
                  <Chip label={p.difficulty} size="small" sx={{ height: 18, fontSize: 10, textTransform: "capitalize", flexShrink: 0 }} />
                </Stack>
              );
            })}
          </Box>
        </Box>

        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            In this assignment ({selectedIds.length})
          </Typography>
          {selectedProblems.length === 0 ? (
            <Box sx={{ border: "1px dashed", borderColor: "outlineVariant", borderRadius: 2 }}>
              <EmptyState icon={<DescriptionOutlinedIcon />} title="Nothing selected yet" description="Pick problems on the left." />
            </Box>
          ) : (
            <Reorder.Group
              axis="y"
              values={selectedIds}
              onReorder={setSelectedIds}
              style={{ padding: 0, margin: 0 }}
            >
              {selectedProblems.map((p, i) => (
                <SelectedRow
                  key={p.id} problem={p} index={i} total={selectedProblems.length}
                  onRemove={() => setSelectedIds((prev) => prev.filter((x) => x !== p.id))}
                  onMove={(delta) => setSelectedIds((prev) => {
                    const from = prev.indexOf(p.id);
                    const to = from + delta;
                    if (from < 0 || to < 0 || to >= prev.length) return prev;
                    const next = [...prev];
                    [next[from], next[to]] = [next[to], next[from]];
                    return next;
                  })}
                />
              ))}
            </Reorder.Group>
          )}
        </Box>
      </Box>
    ),
  };

  const classesStep: AuthoringStep = {
    label: "Who gets it",
    hint: "Pick the classes this is for. Selecting none means every student sees it.",
    content: (
      <Stack spacing={2}>
        {classIds.length === 0 && (
          <Alert severity="info">
            No class selected — <strong>every student</strong> will see this assignment.
          </Alert>
        )}
        {classes.length === 0 ? (
          <EmptyState icon={<GroupsOutlinedIcon />} title="No classes yet" description="Create a class to target assignments at it." />
        ) : (
          <Box sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: 2, maxHeight: 340, overflowY: "auto" }}>
            {classes.map((c) => {
              const chosen = classIds.includes(c.id);
              return (
                <Stack
                  key={c.id} direction="row" alignItems="center" spacing={1}
                  onClick={() => setClassIds((prev) => (chosen ? prev.filter((x) => x !== c.id) : [...prev, c.id]))}
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
                  <Chip
                    icon={<GroupsOutlinedIcon />} label={c.member_count} size="small"
                    sx={{ height: 20, fontSize: 11, flexShrink: 0 }}
                  />
                </Stack>
              );
            })}
          </Box>
        )}
      </Stack>
    ),
  };

  const targetedStudents = classIds.reduce((sum, cid) => sum + (classes.find((c) => c.id === cid)?.member_count ?? 0), 0);
  const reviewStep: AuthoringStep = {
    label: "Review",
    hint: "Check this over — students see it as soon as you save.",
    content: (
      <Stack spacing={2}>
        <Stack spacing={1}>
          <CheckLine ok={!!title.trim()}>Title — {title || "not set"}</CheckLine>
          <CheckLine ok={!!deadline}>
            Deadline — {deadline ? new Date(deadline).toLocaleString() : "not set"}
          </CheckLine>
          <CheckLine ok={selectedIds.length > 0}>
            {selectedIds.length} problem{selectedIds.length === 1 ? "" : "s"}, in the order shown
          </CheckLine>
          <CheckLine ok>
            {classIds.length === 0
              ? "Visible to every student"
              : `${classIds.length} class${classIds.length === 1 ? "" : "es"} · ~${targetedStudents} student${targetedStudents === 1 ? "" : "s"}`}
          </CheckLine>
          <CheckLine ok={!isExam}>
            {isExam ? "Proctored exam — AI tutor disabled, activity logged" : "Ordinary assignment (not proctored)"}
          </CheckLine>
        </Stack>

        {selectedProblems.length > 0 && (
          <Box sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: 2, p: 1.5 }}>
            <Typography variant="overline" color="text.secondary">Order students will see</Typography>
            <Stack spacing={0.25} sx={{ mt: 0.5 }}>
              {selectedProblems.map((p, i) => (
                <Typography key={p.id} variant="body2">{i + 1}. {p.title}</Typography>
              ))}
            </Stack>
          </Box>
        )}

        {saveError && (
          <Alert severity="error">
            <AlertTitle sx={{ fontSize: 14 }}>Not saved</AlertTitle>
            {saveError}
          </Alert>
        )}
      </Stack>
    ),
  };

  const steps = [detailsStep, problemsStep, classesStep, reviewStep];
  const canSave = !!title.trim() && !!deadline && selectedIds.length > 0;

  return (
    <AuthoringShell
      title={title || "Untitled assignment"}
      subtitle={`${selectedIds.length} problem${selectedIds.length === 1 ? "" : "s"} · ${classIds.length === 0 ? "all students" : `${classIds.length} class${classIds.length === 1 ? "" : "es"}`}`}
      statusChip={isExam ? <Chip size="small" label="Exam" sx={{ height: 22, fontWeight: 600, bgcolor: "warningContainer", color: "onWarningContainer" }} /> : undefined}
      steps={steps}
      step={step}
      onStepChange={(n) => setStep(Math.max(0, Math.min(steps.length - 1, n)))}
      saveState={saveState}
      onExit={() => router.push("/faculty/dashboard")}
      finalAction={
        <Tooltip title={canSave ? "" : "Complete the details and pick at least one problem"}>
          <span>
            <Button
              variant="contained" color="success" disabled={saving || !canSave}
              onClick={async () => {
                if (await save()) {
                  toast("Assignment saved", { severity: "success" });
                  router.push("/faculty/dashboard");
                }
              }}
            >
              {saving ? "Saving…" : "Save assignment"}
            </Button>
          </span>
        </Tooltip>
      }
    />
  );
}

// datetime-local needs `YYYY-MM-DDTHH:mm` in local time, so an ISO string has to
// be shifted before it can prefill the field.
function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
