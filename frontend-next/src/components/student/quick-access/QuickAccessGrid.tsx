"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { InteractiveCard } from "@/components/ui/InteractiveCard";
import type { Assignment, CourseSummary, DashboardStats } from "@/lib/types";
import { examStatus, type ExamCardData } from "@/lib/queries/student";
import type { RoadmapSummary } from "@/lib/queries/roadmaps";
import {
  AssignmentsArt,
  ClassArt,
  LearningArt,
  PracticeArt,
  RoadmapArt,
  TestsArt,
} from "./illustrations";

/**
 * The six big entry points — the whole of the Home screen.
 *
 * Modelled on the illustrated home screen the HOD liked, with one difference:
 * every tile carries a live line, so it answers "what should I do now?" rather
 * than just repeating the menu.
 *
 * This used to sit as a row on top of the dashboard and it was wrong there: it
 * competed with the statistics below it and made one page do two jobs. It is
 * its own page now, which is also what makes the tiles worth looking at — they
 * can be large enough to read at a glance from across a lab.
 */

export interface QuickAccessProps {
  stats?: DashboardStats;
  courses: CourseSummary[];
  assignments: Assignment[];
  exams: ExamCardData[];
  className?: string | null;
  /** The roadmap the student chose to follow, if any. */
  activeRoadmap?: RoadmapSummary | null;
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
  activeRoadmap,
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
  // Overdue and upcoming are counted apart: a past deadline is also "within the
  // next 7 days" arithmetically, so lumping them together reported overdue work
  // as due this week.
  const overdue = openAssignments.filter((a) => new Date(a.deadline).getTime() < now);
  const dueThisWeek = openAssignments.filter((a) => {
    const diff = new Date(a.deadline).getTime() - now;
    return diff >= 0 && diff <= 7 * DAY_MS;
  });
  const nextUp = [...dueThisWeek].sort(
    (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
  )[0];

  let assignmentsLine: string;
  if (overdue.length > 0) {
    assignmentsLine =
      overdue.length === 1
        ? `${overdue[0].title} is overdue`
        : `${overdue.length} assignments overdue`;
  } else if (dueThisWeek.length > 1) {
    assignmentsLine = `${dueThisWeek.length} due this week · next ${relativeDay(nextUp.deadline, now)}`;
  } else if (nextUp) {
    assignmentsLine = `${nextUp.title} · ${relativeDay(nextUp.deadline, now)}`;
  } else if (openAssignments.length > 0) {
    assignmentsLine = `${openAssignments.length} open · none due this week`;
  } else {
    assignmentsLine = "Nothing due — you're clear";
  }

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

  // Following a roadmap is the useful state; until then the tile invites the
  // student to pick one rather than reporting a number they have not chosen.
  const roadmapLine = activeRoadmap
    ? activeRoadmap.percent > 0
      ? `${activeRoadmap.role} · ${activeRoadmap.percent}%`
      : `${activeRoadmap.role} · start step 1`
    : "Pick a path for the job you want";

  // Next to a class name, "rank #8" can only mean rank within that class, so it
  // has to be the class rank — this tile was pairing "CSE-A" with the
  // platform-wide rank and reading #8 of 8 while the dashboard said #2 of 8.
  // Same mistake S4 fixed on the dashboard, still alive here.
  const classRank = stats?.classRank ?? 0;
  const classSize = stats?.classSize ?? 0;
  const overallRank = stats?.rank ?? 0;
  const classLine = className
    ? classRank > 0 && classSize > 0
      ? `${className} · rank #${classRank} of ${classSize}`
      : className
    : overallRank > 0
      ? `Ranked #${overallRank} overall`
      : "Join your class";

  return [
    { key: "learning", title: "My Learning", href: inProgress ? `/app/courses/${inProgress.id}` : "/app/courses", art: <LearningArt />, line: learningLine },
    { key: "assignments", title: "Assignments", href: "/app/assignments", art: <AssignmentsArt />, line: assignmentsLine },
    { key: "tests", title: "Tests", href: "/app/tests", art: <TestsArt />, line: testsLine },
    { key: "practice", title: "Practice", href: "/app/problems", art: <PracticeArt />, line: practiceLine },
    { key: "class", title: "My Class", href: "/app/classes", art: <ClassArt />, line: classLine },
    {
      key: "roadmaps",
      title: "Roadmaps",
      href: activeRoadmap ? `/app/roadmaps/${activeRoadmap.id}` : "/app/roadmaps",
      art: <RoadmapArt />,
      line: roadmapLine,
    },
  ];
}

export function QuickAccessGrid(props: QuickAccessProps) {
  // Fixed per mount so deadline wording can't shift between renders.
  const [now] = React.useState(() => Date.now());
  const tiles = React.useMemo(() => buildTiles({ ...props, now }), [props, now]);

  return (
    <Box
      component="nav"
      aria-label="Quick access"
      sx={{
        display: "grid",
        gap: { xs: 2, sm: 3 },
        // One per row on a phone. This is the whole screen, so there is no
        // reason to squeeze six tiles into the sideways-scrolling strip the
        // dashboard row had to use.
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
      }}
    >
      {tiles.map((tile) => (
        <InteractiveCard
          key={tile.key}
          href={tile.href}
          ariaLabel={`${tile.title}. ${tile.line}`}
          contentSx={{ p: 0, alignItems: "stretch" }}
        >
          <Stack sx={{ height: "100%" }}>
            {/* Illustration above the words, on a tinted panel, so the row
                reads as six pictures rather than six paragraphs. */}
            <Box
              aria-hidden
              sx={{
                px: 3,
                pt: 3,
                pb: 2,
                display: "grid",
                placeItems: "center",
                backgroundColor: "surfaceContainerLow",
              }}
            >
              <Box sx={{ width: "100%", maxWidth: 196, aspectRatio: "4 / 3" }}>{tile.art}</Box>
            </Box>

            {/* The live line sits where CodeTantra puts its "click here to…"
                caption, and earns that space by saying something true today. */}
            <Box
              sx={{
                flex: 1,
                px: 2.5,
                py: 2,
                display: "grid",
                placeItems: "center",
                minHeight: 72,
              }}
            >
              {props.loading ? (
                <Skeleton variant="text" width="70%" />
              ) : (
                <Typography variant="body2" color="text.secondary" align="center">
                  {tile.line}
                </Typography>
              )}
            </Box>

            {/* The name last, as a solid bar — the part you aim at. */}
            <Box
              sx={{
                px: 2,
                py: 1.5,
                textAlign: "center",
                backgroundColor: "primary.main",
                color: "primary.contrastText",
              }}
            >
              <Typography variant="subtitle1" component="span" fontWeight={700} noWrap>
                {tile.title}
              </Typography>
            </Box>
          </Stack>
        </InteractiveCard>
      ))}
    </Box>
  );
}
