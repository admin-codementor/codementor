"use client";

import * as React from "react";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import LinearProgress from "@mui/material/LinearProgress";
import { visuallyHidden } from "@mui/utils";
import {
  ArrowBackIcon, CheckCircleOutlineIcon, RadioButtonUncheckedIcon, ViewModuleOutlinedIcon, ExpandMoreIcon,
  TypeIcon, HashIcon, ArrowRightLeftIcon, ArrowDownUpIcon, GitForkIcon, WaypointsIcon, BoxesIcon, BinaryIcon,
  PenToolIcon, LinkOutlinedIcon, LayersOutlinedIcon, AutoAwesomeOutlinedIcon, WorkOutlineOutlinedIcon,
} from "@/components/ui/icons";
import api from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { DifficultyChip } from "@/components/ui/DifficultyChip";
import { TagChip } from "@/components/ui/TagChip";
import { EmptyState, ErrorState } from "@/components/ui/States";
import type { CourseDetail, CourseModule } from "@/lib/types";

// Pick a topic-appropriate icon for a module subcategory (varies per section instead
// of a single constant icon). Falls back to a generic module icon.
function moduleIcon(title: string) {
  const t = title.toLowerCase();
  const sx = { fontSize: 20, color: "text.secondary", flexShrink: 0 } as const;
  if (t.includes("array") || t.includes("matrix") || t.includes("prefix")) return <ViewModuleOutlinedIcon sx={sx} />;
  if (t.includes("string")) return <TypeIcon sx={sx} />;
  if (t.includes("hash")) return <HashIcon sx={sx} />;
  if (t.includes("pointer") || t.includes("sliding") || t.includes("window")) return <ArrowRightLeftIcon sx={sx} />;
  if (t.includes("search") || t.includes("sort")) return <ArrowDownUpIcon sx={sx} />;
  if (t.includes("linked")) return <LinkOutlinedIcon sx={sx} />;
  if (t.includes("stack") || t.includes("queue") || t.includes("heap")) return <LayersOutlinedIcon sx={sx} />;
  if (t.includes("tree") || t.includes("recursion") || t.includes("backtrack")) return <GitForkIcon sx={sx} />;
  if (t.includes("graph")) return <WaypointsIcon sx={sx} />;
  if (t.includes("dynamic") || t.includes(" dp")) return <BoxesIcon sx={sx} />;
  if (t.includes("bit")) return <BinaryIcon sx={sx} />;
  if (t.includes("design")) return <PenToolIcon sx={sx} />;
  if (t.includes("basic")) return <AutoAwesomeOutlinedIcon sx={sx} />;
  // Company modules in the "Advanced DSA for Top Companies" course.
  if (/tcs|accenture|wipro|infosys|cognizant|capgemini|microsoft|amazon|google|adobe|company|placement/.test(t))
    return <WorkOutlineOutlinedIcon sx={sx} />;
  return <ViewModuleOutlinedIcon sx={sx} />;
}

function ModuleSection({ module, defaultExpanded }: { module: CourseModule; defaultExpanded?: boolean }) {
  const solved = module.problems.filter((p) => p.is_solved).length;
  const total = module.problems.length;
  const pct = total > 0 ? Math.round((solved / total) * 100) : 0;
  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      disableGutters
      elevation={0}
      sx={{
        border: "1px solid",
        borderColor: "outlineVariant",
        borderRadius: 2,
        overflow: "hidden",
        "&:before": { display: "none" },
        "&.Mui-expanded": { margin: 0 },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{ px: 2, "& .MuiAccordionSummary-content": { alignItems: "center", gap: 1.5, my: 1.25, minWidth: 0 } }}
      >
        {moduleIcon(module.title)}
        <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1, minWidth: 0 }} noWrap>
          {module.title}
        </Typography>
        {total > 0 && (
          <Box sx={{ width: 88, display: { xs: "none", sm: "block" }, flexShrink: 0 }}>
            <LinearProgress
              variant="determinate"
              value={pct}
              color={pct === 100 ? "success" : "primary"}
              sx={{ height: 6, borderRadius: 3 }}
            />
          </Box>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "ui-monospace, monospace", minWidth: 44, textAlign: "right", flexShrink: 0 }}>
          {solved}/{total}
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 2, pt: 0, pb: 1 }}>
        {total === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            Problems coming soon.
          </Typography>
        ) : (
          <Stack divider={<Box sx={{ borderTop: "1px solid", borderColor: "outlineVariant" }} />}>
            {module.problems.map((p) => (
              <Stack key={p.id} direction="row" alignItems="center" spacing={1.5} sx={{ py: 1.25 }}>
                {p.is_solved ? (
                  <Tooltip title="Solved">
                    <CheckCircleOutlineIcon fontSize="small" sx={{ color: "success.main" }} />
                  </Tooltip>
                ) : (
                  <RadioButtonUncheckedIcon fontSize="small" sx={{ color: "outline" }} />
                )}
                <Box component="span" sx={visuallyHidden}>{p.is_solved ? "Solved" : "Not solved"}</Box>
                <Link
                  component={NextLink}
                  href={`/app/problems/${p.id}`}
                  color="text.primary"
                  sx={{ flex: 1, fontWeight: 500, minWidth: 0, "&:hover": { color: "primary.main" } }}
                  noWrap
                >
                  {p.title}
                </Link>
                {p.tags?.[0] && (
                  <Box sx={{ display: { xs: "none", sm: "inline-flex" } }}>
                    <TagChip tag={p.tags[0]} />
                  </Box>
                )}
                <DifficultyChip difficulty={p.difficulty} />
              </Stack>
            ))}
          </Stack>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export default function CourseDetailPage() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const [course, setCourse] = React.useState<CourseDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<{ success: boolean; data: CourseDetail }>(`/api/courses/${courseId}`);
      if (res.data?.success) setCourse(res.data.data);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const totals = React.useMemo(() => {
    if (!course) return { solved: 0, total: 0 };
    let solved = 0;
    let total = 0;
    for (const m of course.modules) {
      total += m.problems.length;
      solved += m.problems.filter((p) => p.is_solved).length;
    }
    return { solved, total };
  }, [course]);

  return (
    <Box>
      <Link
        component={NextLink}
        href="/app/courses"
        color="text.secondary"
        sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, mb: 2, fontWeight: 500 }}
      >
        <ArrowBackIcon sx={{ fontSize: 18 }} /> All courses
      </Link>

      {error ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <ErrorState title="Couldn't load this course" onRetry={load} />
        </Card>
      ) : loading ? (
        <Box>
          <Skeleton width="50%" height={40} />
          <Skeleton width="80%" sx={{ mb: 3 }} />
          <Stack spacing={2}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" height={120} />
            ))}
          </Stack>
        </Box>
      ) : course ? (
        <>
          <PageHeader
            title={course.title}
            subtitle={course.description ?? undefined}
          />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, fontFamily: "ui-monospace, monospace" }}>
            {totals.solved}/{totals.total} problems solved across {course.modules.length} modules
          </Typography>
          {course.modules.length === 0 ? (
            <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
              <EmptyState icon={<ViewModuleOutlinedIcon />} title="No modules yet" />
            </Card>
          ) : (
            <Stack spacing={2}>
              {course.modules.map((m, idx) => (
                <ModuleSection key={m.id} module={m} defaultExpanded={idx === 0} />
              ))}
            </Stack>
          )}
        </>
      ) : null}
    </Box>
  );
}
