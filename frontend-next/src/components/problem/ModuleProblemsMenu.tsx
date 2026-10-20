"use client";

import * as React from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import LinearProgress from "@mui/material/LinearProgress";
import Link from "@mui/material/Link";
import Popover from "@mui/material/Popover";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import api from "@/lib/api";
import { CheckCircleOutlineIcon, ExpandMoreIcon, RadioButtonUncheckedIcon } from "@/components/ui/icons";
import { DifficultyChip } from "@/components/ui/DifficultyChip";
import type { CourseDetail, CourseModule } from "@/lib/types";

// One course fetch per course per minute is plenty: the list only has to be right when it is opened.
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; data: CourseDetail }>();

async function loadCourse(courseId: string, force = false): Promise<CourseDetail> {
  const hit = cache.get(courseId);
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const res = await api.get<{ success: boolean; data: CourseDetail }>(`/api/courses/${courseId}`);
  cache.set(courseId, { at: Date.now(), data: res.data.data });
  return res.data.data;
}

/**
 * The "where am I" line of the problem header, made useful: "Module 01: Introduction to Python · 3 / 18" opens a list of
 * every problem in that module, with what is solved and what is open, so moving around a module takes one click
 * instead of stepping with the arrows.
 */
export function ModuleProblemsMenu({
  courseId, moduleId, problemId, label, position, total, navContext, solvedNow,
}: {
  courseId: string;
  /** The module the student came from; when absent, the module that holds this problem is used. */
  moduleId: string | null;
  problemId: string;
  label: string;
  position?: number;
  total?: number;
  /** Query string that keeps the student inside this course and module on the next page. */
  navContext: string;
  /** True once this problem has just been solved, so its tick shows without waiting for a refetch. */
  solvedNow: boolean;
}) {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const [course, setCourse] = React.useState<CourseDetail | null>(null);
  const [state, setState] = React.useState<"idle" | "loading" | "error">("idle");
  const currentRef = React.useRef<HTMLAnchorElement | null>(null);

  const open = (el: HTMLElement) => {
    setAnchor(el);
    setState("loading");
    // Refetch when a solve has just happened so the list is not a minute behind.
    loadCourse(courseId, solvedNow)
      .then((c) => { setCourse(c); setState("idle"); })
      .catch(() => setState("error"));
  };

  const mod: CourseModule | undefined = React.useMemo(
    () => course?.modules.find((m) => m.id === moduleId) ?? course?.modules.find((m) => m.problems.some((p) => p.id === problemId)),
    [course, moduleId, problemId],
  );
  const solvedCount = mod ? mod.problems.filter((p) => p.is_solved || (solvedNow && p.id === problemId)).length : 0;

  // Bring the current problem into view when the list opens.
  React.useEffect(() => {
    if (anchor && mod) setTimeout(() => currentRef.current?.scrollIntoView({ block: "center" }), 60);
  }, [anchor, mod]);

  return (
    <>
      <ButtonBase
        onClick={(e) => open(e.currentTarget)}
        aria-haspopup="true"
        aria-expanded={!!anchor}
        aria-label={`${label}${position ? `, problem ${position} of ${total}` : ""}. Show all problems in this module`}
        sx={{
          display: "inline-flex", alignItems: "center", gap: 0.5, maxWidth: "100%", borderRadius: 1, px: 0.75, py: 0.125, mx: -0.75,
          color: "text.secondary", "&:hover, &:focus-visible": { bgcolor: "surfaceContainerHigh", color: "text.primary" },
        }}
      >
        <Typography variant="caption" noWrap sx={{ fontWeight: 600 }}>
          {label}
          {position ? <Box component="span" sx={{ opacity: 0.75, fontWeight: 500 }}>{`  ·  ${position} / ${total}`}</Box> : null}
        </Typography>
        <ExpandMoreIcon sx={{ fontSize: 16, flexShrink: 0, transform: anchor ? "rotate(180deg)" : "none", transition: "transform 120ms" }} />
      </ButtonBase>

      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { width: 420, maxWidth: "calc(100vw - 24px)", border: "1px solid", borderColor: "outlineVariant", mt: 0.5 } } }}
      >
        {state === "loading" && !mod ? (
          <Stack spacing={1} sx={{ p: 2 }}>
            <Skeleton width="60%" />
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="rounded" height={32} />)}
          </Stack>
        ) : state === "error" || !mod ? (
          <Box sx={{ p: 2.5 }}>
            <Typography variant="body2" color="text.secondary">The list of problems could not be loaded.</Typography>
            <Link component="button" type="button" variant="body2" onClick={() => anchor && open(anchor)} sx={{ mt: 1 }}>Try again</Link>
          </Box>
        ) : (
          <Box>
            <Box sx={{ px: 2, pt: 1.75, pb: 1.5, borderBottom: "1px solid", borderColor: "outlineVariant" }}>
              <Typography variant="subtitle2" fontWeight={700} noWrap>{mod.title}</Typography>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 0.75 }}>
                <LinearProgress
                  variant="determinate" value={mod.problems.length ? (solvedCount / mod.problems.length) * 100 : 0}
                  color={solvedCount === mod.problems.length ? "success" : "primary"}
                  aria-label={`${solvedCount} of ${mod.problems.length} solved`}
                  sx={{ flex: 1, height: 6, borderRadius: 3 }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "ui-monospace, monospace" }}>
                  {solvedCount}/{mod.problems.length} solved
                </Typography>
              </Stack>
            </Box>
            <Box component="ol" sx={{ listStyle: "none", m: 0, p: 0.5, maxHeight: "min(60vh, 440px)", overflowY: "auto" }}>
              {mod.problems.map((p, i) => {
                const current = p.id === problemId;
                const solved = p.is_solved || (solvedNow && current);
                return (
                  <li key={p.id}>
                    <Link
                      ref={current ? currentRef : undefined}
                      component={NextLink}
                      href={`/app/problems/${p.id}${navContext}`}
                      onClick={() => setAnchor(null)}
                      underline="none"
                      color="inherit"
                      aria-current={current ? "true" : undefined}
                      sx={{
                        display: "flex", alignItems: "center", gap: 1.25, px: 1.25, py: 0.9, borderRadius: 1.5,
                        bgcolor: current ? "primaryContainer" : "transparent", color: current ? "onPrimaryContainer" : "text.primary",
                        "&:hover": { bgcolor: current ? "primaryContainer" : "surfaceContainerHigh" },
                      }}
                    >
                      <Typography variant="caption" sx={{ width: 22, textAlign: "right", flexShrink: 0, fontFamily: "ui-monospace, monospace", opacity: 0.7 }}>{i + 1}</Typography>
                      {solved
                        ? <CheckCircleOutlineIcon fontSize="small" sx={{ color: "success.main", flexShrink: 0 }} />
                        : <RadioButtonUncheckedIcon fontSize="small" sx={{ color: "outline", flexShrink: 0 }} />}
                      <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0, fontWeight: current ? 700 : 500 }}>{p.title}</Typography>
                      <DifficultyChip difficulty={p.difficulty} />
                    </Link>
                  </li>
                );
              })}
            </Box>
            <Box sx={{ px: 2, py: 1.25, borderTop: "1px solid", borderColor: "outlineVariant" }}>
              <Link component={NextLink} href={`/app/courses/${courseId}${moduleId ? `?module=${moduleId}` : ""}`} onClick={() => setAnchor(null)} variant="body2" underline="hover">
                See the whole course
              </Link>
            </Box>
          </Box>
        )}
      </Popover>
    </>
  );
}
