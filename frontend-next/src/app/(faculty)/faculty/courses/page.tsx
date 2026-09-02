"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Skeleton from "@mui/material/Skeleton";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import { AddIcon, MenuBookOutlinedIcon, ViewModuleOutlinedIcon, FormatListBulletedOutlinedIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/States";
import { interactiveSurfaceSx } from "@/components/ui/interactive";
import { useToast } from "@/components/feedback/ToastProvider";

interface CourseRow {
  id: string;
  title: string;
  description: string;
  isPublished: boolean;
  moduleCount: number;
  problemCount: number;
  author: string | null;
  canEdit: boolean;
}

function NewCourseDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    try {
      const r = await api.post("/api/faculty/courses", { title: title.trim(), description: description.trim() });
      setTitle("");
      setDescription("");
      onCreated(r.data.data.id);
    } catch (e) {
      setError(apiErrorMessage(e, "Couldn't create the course."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New Course</DialogTitle>
      <Box component="form" onSubmit={submit}>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Advanced DSA for Top Companies" size="small" autoFocus />
            <TextField label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} size="small" multiline rows={2} />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={saving || !title.trim()}>
            {saving ? "Creating…" : "Create"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function CourseCard({ course, onClick }: { course: CourseRow; onClick: () => void }) {
  return (
    <Card variant="outlined" sx={{ borderColor: "outlineVariant", ...interactiveSurfaceSx }}>
      <CardActionArea onClick={onClick} sx={{ p: 2.5, height: "100%", borderRadius: "inherit" }}>
        <Stack spacing={1.5} sx={{ height: "100%" }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.3 }}>{course.title}</Typography>
            <Chip
              size="small"
              label={course.isPublished ? "Published" : "Draft"}
              sx={{
                height: 20, fontSize: 10, fontWeight: 700, flexShrink: 0,
                bgcolor: course.isPublished ? "successContainer" : "surfaceContainerHigh",
                color: course.isPublished ? "onSuccessContainer" : "onSurfaceVariant",
              }}
            />
          </Stack>
          {course.description && (
            <Typography variant="body2" color="text.secondary" sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {course.description}
            </Typography>
          )}
          <Box sx={{ flex: 1 }} />
          <Stack direction="row" spacing={2} sx={{ color: "text.secondary" }} flexWrap="wrap" useFlexGap>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <ViewModuleOutlinedIcon sx={{ fontSize: 16 }} />
              <Typography variant="caption">{course.moduleCount} modules</Typography>
            </Stack>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <FormatListBulletedOutlinedIcon sx={{ fontSize: 16 }} />
              <Typography variant="caption">{course.problemCount} problems</Typography>
            </Stack>
            {course.author && (
              <Typography variant="caption" color="text.disabled">by {course.author}</Typography>
            )}
          </Stack>
          {!course.canEdit && <Chip size="small" label="View only" sx={{ height: 18, fontSize: 10, alignSelf: "flex-start" }} />}
        </Stack>
      </CardActionArea>
    </Card>
  );
}

export default function FacultyCoursesPage() {
  const router = useRouter();
  const showToast = useToast();
  const [courses, setCourses] = React.useState<CourseRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [showNew, setShowNew] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    setError("");
    api
      .get("/api/faculty/courses")
      .then((r) => { if (r.data?.success) setCourses(r.data.data); })
      .catch((e) => setError(apiErrorMessage(e, "Couldn't load courses.")))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <Box>
      <PageHeader
        title="Courses"
        subtitle="Curated, free-browsing collections of problems — students work through modules in any order."
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setShowNew(true)}>
            New Course
          </Button>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={load}>Retry</Button>}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(3, 1fr)" }, gap: 2 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} variant="outlined" sx={{ p: 2.5, borderColor: "outlineVariant" }}>
              <Skeleton width="60%" height={28} />
              <Skeleton width="100%" />
              <Skeleton width="90%" />
              <Skeleton width="50%" height={20} sx={{ mt: 2 }} />
            </Card>
          ))}
        </Box>
      ) : courses.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState
            icon={<MenuBookOutlinedIcon />}
            title="No courses yet"
            description="Create a course and organize existing problems into modules for students to practice."
            action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setShowNew(true)}>New Course</Button>}
          />
        </Card>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(3, 1fr)" }, gap: 2 }}>
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} onClick={() => router.push(`/faculty/courses/${c.id}`)} />
          ))}
        </Box>
      )}

      <NewCourseDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={(id) => {
          setShowNew(false);
          showToast("Course created", { severity: "success" });
          router.push(`/faculty/courses/${id}`);
        }}
      />
    </Box>
  );
}
