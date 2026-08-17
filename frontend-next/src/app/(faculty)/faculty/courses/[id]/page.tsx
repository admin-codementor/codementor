"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Skeleton from "@mui/material/Skeleton";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Link from "@mui/material/Link";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Checkbox from "@mui/material/Checkbox";
import Tooltip from "@mui/material/Tooltip";
import {
  AddIcon, CloseIcon, DeleteOutlineIcon, ChevronRightIcon, DescriptionOutlinedIcon,
} from "@/components/ui/icons";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/States";
import { SearchField } from "@/components/ui/SearchField";
import { useToast } from "@/components/feedback/ToastProvider";
import { useConfirm } from "@/components/feedback/ConfirmProvider";

interface ModuleProblem { id: string; title: string; difficulty: string; tags: string[] }
interface CourseModule { id: string; title: string; description: string; problems: ModuleProblem[] }
interface CourseDetail {
  id: string; title: string; description: string; isPublished: boolean; canEdit: boolean;
  modules: CourseModule[];
}
interface PickableProblem { id: string; title: string; difficulty: string; tags: string[] }

// ── Problem picker: search + checkbox list, mirrors the assignment builder's. ──
// Pulls from the public catalogue (GET /api/problems), not the ownership-scoped
// /api/faculty/problems — a module is meant to organize the WHOLE published
// catalogue for students, not just problems this one faculty member authored.
function ProblemPickerDialog({
  open, alreadyIn, onClose, onAdd,
}: {
  open: boolean;
  alreadyIn: Set<string>;
  onClose: () => void;
  onAdd: (ids: string[]) => void;
}) {
  const [problems, setProblems] = React.useState<PickableProblem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [picked, setPicked] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setSearch("");
    setPicked([]);
    setLoading(true);
    api.get("/api/problems?limit=200")
      .then((r) => { if (r.data?.success) setProblems(r.data.data); })
      .finally(() => setLoading(false));
  }, [open]);

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const visible = problems.filter((p) => {
    if (alreadyIn.has(p.id)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.title.toLowerCase().includes(q) || (p.tags ?? []).some((t) => t.toLowerCase().includes(q));
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Add Problems</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <SearchField value={search} onChange={setSearch} placeholder="Search by title or tag" label="Search" />
          <Box sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: 2, maxHeight: 340, overflowY: "auto" }}>
            {loading ? (
              <Stack spacing={1} sx={{ p: 1.5 }}>
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={36} />)}
              </Stack>
            ) : visible.length === 0 ? (
              <EmptyState icon={<DescriptionOutlinedIcon />} title="No matching problems" />
            ) : (
              visible.map((p) => {
                const checked = picked.includes(p.id);
                return (
                  <Stack
                    key={p.id} direction="row" alignItems="center" spacing={1}
                    onClick={() => toggle(p.id)}
                    sx={{
                      px: 1, py: 0.75, cursor: "pointer", borderBottom: "1px solid", borderColor: "outlineVariant",
                      "&:last-of-type": { borderBottom: 0 }, bgcolor: checked ? "primaryContainer" : "transparent",
                    }}
                  >
                    <Checkbox size="small" checked={checked} tabIndex={-1} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap>{p.title}</Typography>
                      {(p.tags ?? []).length > 0 && (
                        <Typography variant="caption" color="text.secondary" noWrap>{p.tags.slice(0, 4).join(" · ")}</Typography>
                      )}
                    </Box>
                    <Chip label={p.difficulty} size="small" sx={{ height: 18, fontSize: 10, textTransform: "capitalize", flexShrink: 0 }} />
                  </Stack>
                );
              })
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={picked.length === 0} onClick={() => { onAdd(picked); onClose(); }}>
          Add {picked.length > 0 ? `${picked.length} ` : ""}Problem{picked.length === 1 ? "" : "s"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ModuleCard({
  module, canEdit, onChange, onDelete,
}: {
  module: CourseModule;
  canEdit: boolean;
  onChange: (patch: { title?: string; description?: string; problem_ids?: string[] }) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = React.useState(module.title);
  const [description, setDescription] = React.useState(module.description);
  const [showPicker, setShowPicker] = React.useState(false);
  React.useEffect(() => { setTitle(module.title); }, [module.title]);
  React.useEffect(() => { setDescription(module.description); }, [module.description]);

  const removeProblem = (id: string) => onChange({ problem_ids: module.problems.filter((p) => p.id !== id).map((p) => p.id) });
  const addProblems = (ids: string[]) => onChange({ problem_ids: [...module.problems.map((p) => p.id), ...ids] });

  return (
    <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <TextField
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => { if (title.trim() && title.trim() !== module.title) onChange({ title: title.trim() }); else setTitle(module.title); }}
              size="small" variant="standard" disabled={!canEdit} fullWidth
              slotProps={{ input: { disableUnderline: !canEdit, sx: { fontWeight: 700, fontSize: "1rem" } } }}
            />
            {canEdit && (
              <Tooltip title="Delete module">
                <IconButton size="small" onClick={onDelete} aria-label="Delete module">
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
          <TextField
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => { if (description.trim() !== module.description) onChange({ description: description.trim() }); }}
            size="small" variant="standard" disabled={!canEdit} fullWidth placeholder="Description (optional)"
            slotProps={{ input: { disableUnderline: !canEdit } }}
          />

          {module.problems.length === 0 ? (
            <Typography variant="caption" color="text.secondary">No problems yet.</Typography>
          ) : (
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {module.problems.map((p) => (
                <Chip
                  key={p.id} size="small" label={p.title}
                  onDelete={canEdit ? () => removeProblem(p.id) : undefined}
                  sx={{ maxWidth: 280 }}
                />
              ))}
            </Stack>
          )}

          {canEdit && (
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setShowPicker(true)} sx={{ alignSelf: "flex-start" }}>
              Add problems
            </Button>
          )}
        </Stack>
      </CardContent>

      <ProblemPickerDialog
        open={showPicker}
        alreadyIn={new Set(module.problems.map((p) => p.id))}
        onClose={() => setShowPicker(false)}
        onAdd={addProblems}
      />
    </Card>
  );
}

export default function CourseEditorPage() {
  const { id } = useParams<{ id: string }>();
  const showToast = useToast();
  const confirm = useConfirm();

  const [course, setCourse] = React.useState<CourseDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [publishing, setPublishing] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    setError("");
    api.get(`/api/faculty/courses/${id}`)
      .then((r) => {
        if (r.data?.success) {
          setCourse(r.data.data);
          setTitle(r.data.data.title);
          setDescription(r.data.data.description);
        }
      })
      .catch((e) => setError(apiErrorMessage(e, "Couldn't load this course.")))
      .finally(() => setLoading(false));
  }, [id]);

  React.useEffect(() => { load(); }, [load]);

  const patchCourse = async (patch: Record<string, unknown>) => {
    try {
      const r = await api.patch(`/api/faculty/courses/${id}`, patch);
      if (r.data?.success) setCourse(r.data.data ? { ...course!, ...r.data.data } : course);
    } catch (e) {
      showToast(apiErrorMessage(e, "Couldn't save that change."), { severity: "error" });
      if (course) { setTitle(course.title); setDescription(course.description); }
    }
  };

  const togglePublish = async () => {
    if (!course) return;
    setPublishing(true);
    try {
      const r = await api.patch(`/api/faculty/courses/${id}`, { isPublished: !course.isPublished });
      setCourse((c) => (c ? { ...c, isPublished: r.data.data.isPublished } : c));
      showToast(course.isPublished ? "Course unpublished" : "Course published", { severity: "success" });
    } catch (e) {
      showToast(apiErrorMessage(e, "Couldn't change publish state."), { severity: "error" });
    } finally {
      setPublishing(false);
    }
  };

  const addModule = async () => {
    try {
      const r = await api.post(`/api/faculty/courses/${id}/modules`, { title: "New module", problem_ids: [] });
      setCourse((c) => (c ? { ...c, modules: [...c.modules, { ...r.data.data, description: "", problems: [] }] } : c));
    } catch (e) {
      showToast(apiErrorMessage(e, "Couldn't create the module."), { severity: "error" });
    }
  };

  const updateModule = async (moduleId: string, patch: { title?: string; description?: string; problem_ids?: string[] }) => {
    try {
      const r = await api.patch(`/api/faculty/courses/${id}/modules/${moduleId}`, patch);
      if (patch.problem_ids) {
        // The problem list changed — reload so newly-added problems hydrate
        // with real titles/tags rather than being reconstructed client-side.
        load();
        return;
      }
      const updated = r.data.data;
      setCourse((c) => (c ? {
        ...c,
        modules: c.modules.map((m) => (m.id === moduleId
          ? { ...m, title: updated.title ?? m.title, description: updated.description ?? m.description }
          : m)),
      } : c));
    } catch (e) {
      showToast(apiErrorMessage(e, "Couldn't save that change."), { severity: "error" });
    }
  };

  const deleteModule = async (moduleId: string) => {
    const ok = await confirm({ title: "Delete this module?", description: "Its problems are not deleted, only removed from this course.", destructive: true, confirmLabel: "Delete" });
    if (!ok) return;
    try {
      await api.delete(`/api/faculty/courses/${id}/modules/${moduleId}`);
      setCourse((c) => (c ? { ...c, modules: c.modules.filter((m) => m.id !== moduleId) } : c));
      showToast("Module deleted", { severity: "success" });
    } catch (e) {
      showToast(apiErrorMessage(e, "Couldn't delete the module."), { severity: "error" });
    }
  };

  if (loading) {
    return <Stack spacing={2}><Skeleton variant="rounded" height={64} /><Skeleton variant="rounded" height={200} /></Stack>;
  }
  if (error || !course) {
    return <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}><EmptyState title="Couldn't load this course" description={error} /></Card>;
  }

  return (
    <Box>
      <Breadcrumbs separator={<ChevronRightIcon fontSize="small" sx={{ color: "text.disabled" }} />} sx={{ mb: 1.5 }}>
        <Link component={NextLink} href="/faculty/courses" underline="hover" color="text.secondary">Courses</Link>
        <Typography variant="body2" color="text.primary" fontWeight={600}>{course.title}</Typography>
      </Breadcrumbs>

      <PageHeader
        title=""
        actions={
          course.canEdit ? (
            <Button
              variant={course.isPublished ? "outlined" : "contained"}
              color={course.isPublished ? "warning" : "primary"}
              disabled={publishing}
              onClick={togglePublish}
            >
              {course.isPublished ? "Unpublish" : "Publish"}
            </Button>
          ) : undefined
        }
      />

      <Card variant="outlined" sx={{ borderColor: "outlineVariant", mb: 3 }}>
        <CardContent>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <TextField
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => { if (title.trim() && title.trim() !== course.title) patchCourse({ title: title.trim() }); else setTitle(course.title); }}
                size="small" variant="standard" disabled={!course.canEdit} fullWidth
                slotProps={{ input: { disableUnderline: !course.canEdit, sx: { fontWeight: 700, fontSize: "1.25rem" } } }}
              />
              <Chip
                size="small" label={course.isPublished ? "Published" : "Draft"}
                sx={{
                  fontWeight: 700, flexShrink: 0,
                  bgcolor: course.isPublished ? "successContainer" : "surfaceContainerHigh",
                  color: course.isPublished ? "onSuccessContainer" : "onSurfaceVariant",
                }}
              />
            </Stack>
            <TextField
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => { if (description.trim() !== course.description) patchCourse({ description: description.trim() }); }}
              size="small" variant="standard" disabled={!course.canEdit} fullWidth multiline placeholder="Description (optional)"
              slotProps={{ input: { disableUnderline: !course.canEdit } }}
            />
            {!course.canEdit && <Alert severity="info" sx={{ mt: 1 }}>You can view this course but can&apos;t edit it — it belongs to another faculty member.</Alert>}
          </Stack>
        </CardContent>
      </Card>

      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={700}>Modules</Typography>
        {course.canEdit && (
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addModule}>New Module</Button>
        )}
      </Stack>

      {course.modules.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState
            icon={<CloseIcon sx={{ opacity: 0 }} />}
            title="No modules yet"
            description={course.canEdit ? "Add a module and pick problems for it." : "This course has no modules yet."}
          />
        </Card>
      ) : (
        <Stack spacing={2}>
          {course.modules.map((m) => (
            <ModuleCard
              key={m.id}
              module={m}
              canEdit={course.canEdit}
              onChange={(patch) => updateModule(m.id, patch)}
              onDelete={() => deleteModule(m.id)}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}
