"use client";

import * as React from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import Skeleton from "@mui/material/Skeleton";
import { SchoolOutlinedIcon, ViewModuleOutlinedIcon, FormatListBulletedOutlinedIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { interactiveSurfaceSx } from "@/components/ui/interactive";
import { Reveal } from "@/components/ui/motion";
import type { CourseSummary } from "@/lib/types";

function CourseCard({ course }: { course: CourseSummary }) {
  const pct = course.problemCount > 0 ? Math.round((course.solvedCount / course.problemCount) * 100) : 0;
  return (
    <Card variant="outlined" sx={{ borderColor: "outlineVariant", ...interactiveSurfaceSx }}>
      <CardActionArea component={NextLink} href={`/app/courses/${course.id}`} sx={{ p: 2.5, height: "100%", borderRadius: "inherit" }}>
        <Stack spacing={1.5} sx={{ height: "100%" }}>
          <Box
            aria-hidden
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2.5,
              display: "grid",
              placeItems: "center",
              color: "onPrimaryContainer",
              background: "linear-gradient(135deg, var(--mui-palette-primaryContainer), color-mix(in srgb, var(--mui-palette-onPrimaryContainer) 16%, var(--mui-palette-primaryContainer)))",
              boxShadow: "0 4px 12px color-mix(in srgb, var(--mui-palette-primaryContainer) 55%, transparent)",
            }}
          >
            <SchoolOutlinedIcon />
          </Box>
          <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.3 }}>
            {course.title}
          </Typography>
          {course.description && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
            >
              {course.description}
            </Typography>
          )}
          <Box sx={{ flex: 1 }} />
          <Stack direction="row" spacing={2} sx={{ color: "text.secondary" }}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <ViewModuleOutlinedIcon sx={{ fontSize: 16 }} />
              <Typography variant="caption">{course.moduleCount} modules</Typography>
            </Stack>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <FormatListBulletedOutlinedIcon sx={{ fontSize: 16 }} />
              <Typography variant="caption">{course.problemCount} problems</Typography>
            </Stack>
          </Stack>
          <Box>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">Progress</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "ui-monospace, monospace" }}>
                {course.solvedCount}/{course.problemCount} · {pct}%
              </Typography>
            </Stack>
            <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3 }} />
          </Box>
        </Stack>
      </CardActionArea>
    </Card>
  );
}

export default function CoursesPage() {
  const [courses, setCourses] = React.useState<CourseSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<{ success: boolean; data: CourseSummary[] }>("/api/courses");
      if (res.data?.success) setCourses(res.data.data ?? []);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <Box>
      <PageHeader
        title="Courses"
        subtitle="Structured learning paths — work through modules from foundational to advanced."
        actions={
          <Button component={NextLink} href="/app/problems" variant="outlined" startIcon={<FormatListBulletedOutlinedIcon />}>
            Browse all problems
          </Button>
        }
      />

      {error ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <ErrorState title="Couldn't load courses" onRetry={load} />
        </Card>
      ) : loading ? (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(3, 1fr)" }, gap: 2 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} variant="outlined" sx={{ p: 2.5, borderColor: "outlineVariant" }}>
              <Skeleton variant="rounded" width={44} height={44} />
              <Skeleton width="70%" height={28} sx={{ mt: 1.5 }} />
              <Skeleton width="100%" />
              <Skeleton width="90%" />
              <Skeleton width="100%" height={6} sx={{ mt: 2 }} />
            </Card>
          ))}
        </Box>
      ) : courses.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState
            icon={<SchoolOutlinedIcon />}
            title="No courses yet"
            description="Courses will appear here once published."
            action={
              <Button component={NextLink} href="/app/problems" variant="contained">
                Browse all problems
              </Button>
            }
          />
        </Card>
      ) : (
        <Reveal>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(3, 1fr)" }, gap: 2 }}>
            {courses.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </Box>
        </Reveal>
      )}
    </Box>
  );
}
