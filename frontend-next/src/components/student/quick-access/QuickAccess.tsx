"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { InteractiveCard } from "@/components/ui/InteractiveCard";
import { ExpandLessIcon, ExpandMoreIcon } from "@/components/ui/icons";
import { layout } from "@/theme/tokens";
import type { Assignment, CourseSummary, DashboardStats } from "@/lib/types";
import { examStatus, type ExamCardData } from "@/lib/queries/student";
import {
  AssignmentsArt,
  ClassArt,
  LearningArt,
  PracticeArt,
  RoadmapArt,
  TestsArt,
} from "./illustrations";

/**
 * The six big entry points, shown above the dashboard's detail.
 *
 * Modelled on the illustrated home screen the HOD liked, with one difference:
 * every tile carries a live line, so the row answers "what should I do now?"
 * rather than just repeating the menu.
 */

const COLLAPSE_KEY = "cm:quickAccess:collapsed";

export interface QuickAccessProps {
  stats?: DashboardStats;
  courses: CourseSummary[];
  assignments: Assignment[];
  exams: ExamCardData[];
  className?: string | null;
  loading?: boolean;
}

interface Tile {
  key: string;
  title: string;
  href: string;
  art: React.ReactNode;
  line: string;
}

const DAY_MS = 86_400_000;

/** "in 3 days", "today", "tomorrow" — short enough for one line on a tile. */
function relativeDay(iso: string, now: number): string {
  const diff = new Date(iso).getTime() - now;
  if (Number.isNaN(diff)) return "";
  const days = Math.ceil(diff / DAY_MS);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return `in ${days} days`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function buildTiles({
  stats,
  courses,
  assignments,
  exams,
  className,
  now,
}: Omit<QuickAccessProps, "loading"> & { now: number }): Tile[] {
  // Furthest-along course that isn't finished; otherwise anything started.
  const inProgress = [...courses]
    .filter((c) => c.problemCount > 0)
    .sort((a, b) => b.solvedCount / b.problemCount - a.solvedCount / a.problemCount)
    .find((c) => c.solvedCount < c.problemCount);

  const learningLine = inProgress
    ? `${inProgress.title} · ${Math.round((inProgress.solvedCount / inProgress.problemCount) * 100)}%`
    : courses.length > 0
      ? "All caught up — pick a new course"
      : "Start your first course";

  const openAssignments = assignments.filter((a) => a.solved < a.total && a.deadline);
  const nextAssignment = [...openAssignments].sort(
    (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
  )[0];
  const dueThisWeek = openAssignments.filter(
    (a) => new Date(a.deadline).getTime() - now <= 7 * DAY_MS,
  ).length;

  const assignmentsLine = nextAssignment
    ? dueThisWeek > 1
      ? `${dueThisWeek} due this week · next ${relativeDay(nextAssignment.deadline, now)}`
      : `${nextAssignment.title} · ${relativeDay(nextAssignment.deadline, now)}`
    : "Nothing due — you're clear";

  const liveExam = exams.find((e) => examStatus(e, now) === "live");
  const nextExam = exams
    .filter((e) => examStatus(e, now) === "upcoming")
    .sort((a, b) => new Date(a.window_start).getTime() - new Date(b.window_start).getTime())[0];
  const testsLine = liveExam
    ? `${liveExam.title} is live now`
    : nextExam
      ? `${nextExam.title} · ${relativeDay(nextExam.window_start, now)}`
      : "No tests scheduled";

  const streak = stats?.streak ?? 0;
  const practiceLine =
    streak > 0
      ? `${streak}-day streak · keep it going`
      : stats && stats.problemsSolved > 0
        ? "Pick up where you left off"
        : "Solve your first problem";

  const rank = stats?.rank ?? 0;
  const classLine = className
    ? rank > 0
      ? `${className} · rank #${rank}`
      : className
    : rank > 0
      ? `Ranked #${rank}`
      : "Join your class";

  return [
    { key: "learning", title: "My Learning", href: inProgress ? `/app/courses/${inProgress.id}` : "/app/courses", art: <LearningArt />, line: learningLine },
    { key: "assignments", title: "Assignments", href: "/app/assignments", art: <AssignmentsArt />, line: assignmentsLine },
    { key: "tests", title: "Tests", href: "/app/exams", art: <TestsArt />, line: testsLine },
    { key: "practice", title: "Practice", href: "/app/problems", art: <PracticeArt />, line: practiceLine },
    { key: "class", title: "My Class", href: "/app/classes", art: <ClassArt />, line: classLine },
    { key: "roadmaps", title: "Roadmaps", href: "/app/placement", art: <RoadmapArt />, line: "See where you stand for placements" },
  ];
}

export function QuickAccess(props: QuickAccessProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  // Read once on mount: localStorage isn't available during server rendering,
  // and can throw outright in a private window or with site data blocked.
  React.useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage unavailable — the row just stays open */
    }
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* preference simply isn't remembered */
      }
      return next;
    });
  };

  // Fixed per mount so deadline wording can't shift between renders.
  const [now] = React.useState(() => Date.now());
  const tiles = React.useMemo(
    () => buildTiles({ ...props, now }),
    [props, now],
  );

  return (
    <Box component="section" aria-labelledby="quick-access-heading" sx={{ mb: layout.sectionGap }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Typography id="quick-access-heading" variant="subtitle2" fontWeight={600} color="text.secondary">
          Quick access
        </Typography>
        <Button
          size="small"
          onClick={toggle}
          endIcon={collapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
          aria-expanded={!collapsed}
          aria-controls="quick-access-tiles"
        >
          {collapsed ? "Show" : "Hide"}
        </Button>
      </Stack>

      {/* Rendered conditionally rather than with <Collapse>: the collapse
          wrapper kept its height here, so hiding left an empty gap. Showing and
          hiding is a rare preference action that doesn't need an animation. */}
      {!collapsed && (
        <Box
          id="quick-access-tiles"
          sx={{
            display: "grid",
            gap: 2,
            // Phones scroll the row sideways rather than stacking six tall tiles.
            gridAutoFlow: { xs: "column", sm: "row" },
            gridAutoColumns: { xs: "78%", sm: "auto" },
            gridTemplateColumns: { xs: "none", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
            overflowX: { xs: "auto", sm: "visible" },
            scrollSnapType: { xs: "x mandatory", sm: "none" },
            pb: { xs: 1, sm: 0 },
            mx: { xs: -2, sm: 0 },
            px: { xs: 2, sm: 0 },
          }}
        >
          {tiles.map((tile) => (
            <InteractiveCard
              key={tile.key}
              href={tile.href}
              ariaLabel={`${tile.title}. ${tile.line}`}
              sx={{ scrollSnapAlign: "start" }}
            >
              <Stack direction="row" alignItems="center" spacing={2} sx={{ p: layout.cardPadding }}>
                <Box sx={{ width: 84, height: 63, flexShrink: 0 }}>{tile.art}</Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    {tile.title}
                  </Typography>
                  {props.loading ? (
                    <Skeleton variant="text" width="80%" />
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {tile.line}
                    </Typography>
                  )}
                </Box>
              </Stack>
            </InteractiveCard>
          ))}
        </Box>
      )}
    </Box>
  );
}
