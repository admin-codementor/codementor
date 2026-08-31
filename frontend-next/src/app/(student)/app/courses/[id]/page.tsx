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
  return <ViewModuleOutlinedIcon sx={sx} />;
}

// "TCS Programs" -> "TCS", "Advanced DSA" -> null. Company-program modules get a
// distinct colored initials avatar instead of a generic icon, since every company
// module was otherwise using the exact same briefcase glyph -- indistinguishable
// at a glance, which is the opposite of what a module list is for.
function companyName(title: string): string | null {
  const m = title.match(/^(.+?)\s+Programs?$/i);
  return m ? m[1].trim() : null;
}

function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

// Deterministic hue from the name so the same company always gets the same color,
// and different companies are visually distinct from each other.
function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

function ModuleSection({ module, defaultExpanded }: { module: CourseModule; defaultExpanded?: boolean }) {
  const solved = module.problems.filter((p) => p.is_solved).length;
  const total = module.problems.length;
  const pct = total > 0 ? Math.round((solved / total) * 100) : 0;
  const company = companyName(module.title);
  const isEmpty = total === 0;
  return (
    <Accordion
      defaultExpanded={defaultExpanded && !isEmpty}
      disableGutters
      elevation={0}
      sx={{
        border: "1px solid",
        borderColor: "outlineVariant",
        borderRadius: 2,
        overflow: "hidden",
        opacity: isEmpty ? 0.6 : 1,
        "&:before": { display: "none" },
        "&.Mui-expanded": { margin: 0 },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{ px: 2, "& .MuiAccordionSummary-content": { alignItems: "center", gap: 1.5, my: 1.25, minWidth: 0 } }}
      >
        {company ? (
          <Box
            aria-hidden
            sx={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              fontSize: 12,
              fontWeight: 700,
              color: `hsl(${hueOf(company)}, 70%, 92%)`,
              bgcolor: `hsl(${hueOf(company)}, 45%, 32%)`,
            }}
          >
            {initialsOf(company)}
          </Box>
        ) : (
          <Box
            aria-hidden
            sx={{
              width: 32,
              height: 32,
              borderRadius: 2,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              color: "onPrimaryContainer",
              background: "linear-gradient(135deg, var(--mui-palette-primaryContainer), color-mix(in srgb, var(--mui-palette-onPrimaryContainer) 12%, var(--mui-palette-primaryContainer)))",
            }}
          >
            {moduleIcon(module.title)}
          </Box>
        )}
        <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1, minWidth: 0 }} noWrap>
          {module.title}
        </Typography>
        {total > 0 && (
          <Box sx={{ width: 100, display: { xs: "none", sm: "block" }, flexShrink: 0 }}>
            <LinearProgress
              variant="determinate"
              value={pct}
              color={pct === 100 ? "success" : "primary"}
              sx={{ height: 6, borderRadius: 3 }}
            />
          </Box>
        )}
        {isEmpty ? (
          <Typography variant="caption" color="text.disabled" sx={{ minWidth: 90, textAlign: "right", flexShrink: 0 }}>
            Coming soon
          </Typography>
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "ui-monospace, monospace", minWidth: 44, textAlign: "right", flexShrink: 0 }}>
            {solved}/{total}
          </Typography>
        )}
      </AccordionSummary>
      <AccordionDetails sx={{ px: 1, pt: 0, pb: 1 }}>
        {total === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1, px: 1 }}>
            Problems coming soon.
          </Typography>
        ) : (
          <Stack spacing={0.25}>
            {module.problems.map((p, i) => (
              <Link
                key={p.id}
                component={NextLink}
                href={`/app/problems/${p.id}`}
                underline="none"
                color="inherit"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 1.5,
                  py: 1.1,
                  borderRadius: 1.5,
                  transition: "background-color 120ms ease",
                  "&:hover": { bgcolor: "surfaceContainer" },
                  "&:hover .problem-row-title": { color: "primary.main" },
                }}
              >
                <Typography
                  variant="caption"
                  color="text.disabled"
                  sx={{ fontFamily: "ui-monospace, monospace", minWidth: 20, textAlign: "right", flexShrink: 0 }}
                >
                  {i + 1}
                </Typography>
                {p.is_solved ? (
                  <Tooltip title="Solved">
                    <CheckCircleOutlineIcon fontSize="small" sx={{ color: "success.main", flexShrink: 0 }} />
                  </Tooltip>
                ) : (
                  <RadioButtonUncheckedIcon fontSize="small" sx={{ color: "outline", flexShrink: 0 }} />
                )}
                <Box component="span" sx={visuallyHidden}>{p.is_solved ? "Solved" : "Not solved"}</Box>
                <Typography
                  className="problem-row-title"
                  sx={{ flex: 1, fontWeight: 500, minWidth: 0, transition: "color 120ms ease" }}
                  noWrap
                >
                  {p.title}
                </Typography>
                {p.tags?.[0] && (
                  <Box sx={{ display: { xs: "none", sm: "inline-flex" } }}>
                    <TagChip tag={p.tags[0]} />
                  </Box>
                )}
                <DifficultyChip difficulty={p.difficulty} />
              </Link>
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
