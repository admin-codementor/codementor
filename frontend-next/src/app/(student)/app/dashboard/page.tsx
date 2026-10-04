"use client";

import * as React from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import LinearProgress from "@mui/material/LinearProgress";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import { ArrowForwardIcon, CodeOutlinedIcon, LocalFireDepartmentOutlinedIcon, LeaderboardOutlinedIcon, TipsAndUpdatesOutlinedIcon, AssignmentOutlinedIcon, WarningAmberOutlinedIcon, CheckCircleOutlinedIcon, MenuBookOutlinedIcon, TimerOutlinedIcon } from "@/components/ui/icons";
import { getUser } from "@/lib/auth";
import { languageName } from "@/lib/languages";
import { Reveal } from "@/components/ui/motion";
import { StatCard } from "@/components/ui/StatCard";
import { shape, hoverTransition, radius } from "@/theme/tokens";
import { DifficultyChip } from "@/components/ui/DifficultyChip";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { ActivityHeatmap } from "@/components/ui/ActivityHeatmap";
import { useAvailableExamsQuery, useDashboardQuery } from "@/lib/queries/student";
import { ProblemOfTheDay } from "@/components/student/ProblemOfTheDay";
import { ExamPerformance } from "@/components/student/ExamPerformance";
import { QuickAccess } from "@/components/student/quick-access/QuickAccess";

/** One deadline on the dashboard, whether it came from an assignment or an exam. */
interface DueItem {
  id: string;
  kind: "assignment" | "exam";
  title: string;
  due: string;
  detail: string;
  /** Percent complete, or null when the item has no partial progress (an exam). */
  progress: number | null;
  href: string;
}

// â”€â”€ Utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function deadlineLabel(deadlineStr: string): {
  text: string;
  urgent: boolean;
} {
  const deadline = new Date(deadlineStr);
  const diff = deadline.getTime() - Date.now();
  const hours = diff / 3_600_000;
  if (hours < 0) return { text: "Overdue", urgent: true };
  if (hours < 24)
    return { text: `Due in ${Math.floor(hours)}h`, urgent: true };
  const days = Math.floor(hours / 24);
  if (days === 1) return { text: "Due tomorrow", urgent: false };
  if (days < 7) return { text: `Due in ${days}d`, urgent: false };
  return {
    text: deadline.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    urgent: false,
  };
}

// â”€â”€ Section card wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SectionCard({
  title,
  action,
  children,
  "aria-label": ariaLabel,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  return (
    <Card
      variant="outlined"
      component="section"
      aria-label={ariaLabel ?? title}
      sx={{ borderColor: "outlineVariant" }}
    >
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 2 }}
        >
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ lineHeight: 1 }}
          >
            {title}
          </Typography>
          {action}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

// â”€â”€ Loading skeleton â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function DashboardSkeleton() {
  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Skeleton width={260} height={36} />
        <Skeleton width={180} height={20} sx={{ mt: 1 }} />
      </Box>
      {/* stat cards */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" },
          gap: 2,
          mb: 3,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <Card
            key={i}
            variant="outlined"
            sx={{ p: 2.5, borderColor: "outlineVariant" }}
          >
            <Stack direction="row" spacing={2} alignItems="center">
              <Skeleton variant="rounded" width={48} height={48} />
              <Box sx={{ flex: 1 }}>
                <Skeleton width="60%" height={14} />
                <Skeleton width="40%" height={28} sx={{ mt: 0.5 }} />
              </Box>
            </Stack>
          </Card>
        ))}
      </Box>
      {/* content grid */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "minmax(0,7fr) minmax(0,5fr)" },
          gap: 3,
        }}
      >
        <Stack spacing={3}>
          <Card
            variant="outlined"
            sx={{ p: 2.5, borderColor: "outlineVariant" }}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <Box key={i} sx={{ mb: 2 }}>
                <Skeleton width="70%" height={16} />
                <Skeleton width="40%" height={14} sx={{ mt: 0.5 }} />
              </Box>
            ))}
          </Card>
          <Card
            variant="outlined"
            sx={{ p: 2.5, borderColor: "outlineVariant" }}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <Box key={i} sx={{ mb: 2 }}>
                <Skeleton width="50%" height={14} />
                <Skeleton height={8} sx={{ mt: 1, borderRadius: 1 }} />
              </Box>
            ))}
          </Card>
        </Stack>
        <Stack spacing={3}>
          <Card
            variant="outlined"
            sx={{ p: 2.5, borderColor: "outlineVariant" }}
          >
            <Skeleton height={40} />
          </Card>
          <Card
            variant="outlined"
            sx={{ p: 2.5, borderColor: "outlineVariant" }}
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} height={60} sx={{ mb: 1 }} />
            ))}
          </Card>
        </Stack>
      </Box>
    </Box>
  );
}

// â”€â”€ Main page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function DashboardPage() {
  const [name, setName] = React.useState("");
  const [className, setClassName] = React.useState<string | null>(null);
  // Fixed per mount: reading the clock during render makes the output depend on
  // when React happens to re-render.
  const [renderedAt] = React.useState(() => Date.now());

  React.useEffect(() => {
    const user = getUser();
    setName(user?.name?.split(" ")[0] ?? "");
    // "CSE-A" reads as the student's class without another request.
    setClassName(user?.department ? [user.department, user.section].filter(Boolean).join("-") : null);
  }, []);

  const { data, isLoading, isError, error, refetch } = useDashboardQuery();
  // Feeds the Tests tile. Its own failure must not take the dashboard down, so
  // it stays a separate query and falls back to an empty list.
  const { data: exams } = useAvailableExamsQuery();

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !data) return <ErrorState error={error} onRetry={() => refetch()} />;

  const { dashboard, assignments, recommendations, courses } = data;
  const { stats, topics, recentSolved, heatmap } = dashboard;
  const isNewUser = stats.totalSubs === 0;

  // Sort assignments by deadline, only show ones with a deadline
  const upcomingAssignments = assignments
    .filter((a) => a.deadline)
    .sort(
      (a, b) =>
        new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    )
    .slice(0, 5);

  const coursesCompleted = courses.filter(
    (c) => c.problemCount > 0 && c.solvedCount >= c.problemCount,
  ).length;

  // Everything with a deadline in one list. Assignments and exams were shown in
  // separate places, so "what's due next" meant checking two screens.
  const dueSoon: DueItem[] = [
    ...assignments
      .filter((a) => a.deadline && a.solved < a.total)
      .map((a) => ({
        id: `assignment-${a.id}`,
        kind: "assignment" as const,
        title: a.title,
        due: a.deadline,
        detail: `${a.solved}/${a.total} solved`,
        progress: a.total > 0 ? Math.round((a.solved / a.total) * 100) : 0,
        href: "/app/assignments",
      })),
    ...(exams ?? [])
      .filter((e) => !e.attempted && new Date(e.window_end).getTime() > renderedAt)
      .map((e) => ({
        id: `exam-${e.id}`,
        kind: "exam" as const,
        title: e.title,
        due: e.window_start,
        detail: `${e.duration_minutes} min Â· ${e.section_count} section${e.section_count === 1 ? "" : "s"}`,
        progress: null,
        href: "/app/exams",
      })),
  ]
    .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())
    .slice(0, 5);

  const topTopics = topics.slice(0, 6);
  const topRecs = recommendations.slice(0, 5);

  // "Continue where you left off": courses already started (and not finished)
  // sort first, so the dashboard surfaces progress rather than a flat list.
  const courseRows = [...courses]
    .filter((c) => c.problemCount > 0)
    .sort((a, b) => {
      const aStarted = a.solvedCount > 0 && a.solvedCount < a.problemCount;
      const bStarted = b.solvedCount > 0 && b.solvedCount < b.problemCount;
      if (aStarted !== bStarted) return aStarted ? -1 : 1;
      return b.solvedCount / b.problemCount - a.solvedCount / a.problemCount;
    })
    .slice(0, 3);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <Box>
      {/* â”€â”€ Hero greeting â€” dashboard-only, not the shared PageHeader, so no
          other page inherits this treatment. Same tonal-gradient + colored-
          shadow technique as StatCard's icon tile, scaled up into a band. â”€â”€ */}
      <Box
        sx={{
          mb: 3,
          p: { xs: 2.5, sm: 3.5 },
          borderRadius: `${shape.extraLarge}px`,
          color: "onPrimaryContainer",
          background: "linear-gradient(135deg, var(--mui-palette-primaryContainer), color-mix(in srgb, var(--mui-palette-onPrimaryContainer) 12%, var(--mui-palette-primaryContainer)))",
          boxShadow: "0 8px 24px color-mix(in srgb, var(--mui-palette-primaryContainer) 45%, transparent)",
        }}
      >
        <Typography variant="h3" component="h1" fontWeight={700} sx={{ letterSpacing: "-0.01em" }}>
          {name ? `${greeting}, ${name}!` : greeting + "!"}
        </Typography>
        <Typography variant="body1" sx={{ mt: 0.75, opacity: 0.85, maxWidth: 560 }}>
          {isNewUser
            ? "Ready to start your coding journey? Pick a problem and dive in."
            : `You've solved ${stats.problemsSolved} problem${stats.problemsSolved !== 1 ? "s" : ""} and you're on a ${stats.streak}-day streak. Keep going!`}
        </Typography>
      </Box>

      <QuickAccess
        stats={stats}
        courses={courses}
        assignments={assignments}
        exams={exams ?? []}
        className={className}
      />

      {/* â”€â”€ Stats row â”€â”€ */}
      <Reveal>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" },
          gap: 2,
          mb: 3,
        }}
      >
        <StatCard
          icon={<CodeOutlinedIcon />}
          label="Problems Solved"
          value={stats.problemsSolved}
          accent="primary"
        />
        <StatCard
          icon={<LocalFireDepartmentOutlinedIcon />}
          label="Day Streak"
          value={stats.streak}
          helper={`Goal: ${Math.min(stats.streak, 30)} / 30 days`}
          accent="warning"
        />
        {/* Labelled "Overall" deliberately: the backend ranks this student
            against every student on the platform, not their class. Class and
            department scoping arrives with the scoped leaderboard. */}
        <StatCard
          icon={<LeaderboardOutlinedIcon />}
          label="Overall Rank"
          value={stats.rank > 0 ? `#${stats.rank}` : "â€”"}
          helper="Across all students"
          href="/app/leaderboard"
          accent="secondary"
        />
        <StatCard
          icon={<MenuBookOutlinedIcon />}
          label="Courses Completed"
          value={coursesCompleted}
          helper={courses.length > 0 ? `of ${courses.length} enrolled` : undefined}
          accent="tertiary"
        />
      </Box>
      </Reveal>

      <Box sx={{ mb: 3 }}>
        <ProblemOfTheDay />
      </Box>

      <ExamPerformance />

      {/* â”€â”€ New-user empty state â”€â”€ */}
      {isNewUser && (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", mb: 3 }}>
          <EmptyState
            icon={<CodeOutlinedIcon />}
            title="No submissions yet"
            description="Solve your first problem to start tracking progress, streaks, and topic mastery."
            action={
              <Button
                component={NextLink}
                href="/app/problems"
                variant="contained"
                endIcon={<ArrowForwardIcon />}
              >
                Browse Problems
              </Button>
            }
          />
        </Card>
      )}

      {/* â”€â”€ Content grid â”€â”€ */}
      {!isNewUser && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: "minmax(0,7fr) minmax(0,5fr)",
            },
            gap: 3,
            alignItems: "start",
          }}
        >
          {/* â”€â”€ Left column â”€â”€ */}
          <Stack spacing={3}>
            {/* Recently solved â€” accepted work only; failed attempts are not a
                history worth scrolling. */}
            <SectionCard
              title="Recently Solved"
              aria-label="Recently solved problems"
              action={
                <Link
                  component={NextLink}
                  href="/app/profile?tab=submissions"
                  variant="body2"
                  sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                >
                  View all <ArrowForwardIcon fontSize="small" />
                </Link>
              }
            >
              {recentSolved.length === 0 ? (
                <EmptyState
                  compact
                  variant="firstUse"
                  title="Nothing solved yet"
                  description="Problems you solve will be listed here."
                  action={
                    <Button component={NextLink} href="/app/problems" variant="outlined" size="small">
                      Find a problem
                    </Button>
                  }
                />
              ) : (
                <List disablePadding>
                  {recentSolved.map((item, idx) => (
                    <React.Fragment key={`${item.problem_id}-${item.solved_at}`}>
                      {idx > 0 && <Divider component="li" />}
                      <ListItem disablePadding>
                        <ListItemButton
                          component={NextLink}
                          href={`/app/problems/${item.problem_id}`}
                          sx={{ px: 1, py: 1.25, borderRadius: radius.sm, overflow: "hidden" }}
                        >
                          <CheckCircleOutlinedIcon fontSize="small" color="success" sx={{ mr: 1.25 }} />
                          <ListItemText
                            primary={item.problem_title}
                            secondary={`${languageName(item.language)} Â· ${timeAgo(item.solved_at)}`}
                            sx={{ minWidth: 0, mr: 1 }}
                            slotProps={{
                              primary: { variant: "body2", fontWeight: 500, noWrap: true },
                              secondary: { variant: "caption", noWrap: true },
                            }}
                          />
                          {item.difficulty && (
                            <Box sx={{ flexShrink: 0 }}>
                              <DifficultyChip difficulty={item.difficulty} />
                            </Box>
                          )}
                        </ListItemButton>
                      </ListItem>
                    </React.Fragment>
                  ))}
                </List>
              )}
            </SectionCard>

            {/* Continue Learning â€” modules/courses already in progress surface first. */}
            {courseRows.length > 0 && (
              <SectionCard
                title="Continue Learning"
                aria-label="Courses"
                action={
                  <Link
                    component={NextLink}
                    href="/app/courses"
                    variant="body2"
                    sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                  >
                    All courses <ArrowForwardIcon sx={{ fontSize: 16 }} />
                  </Link>
                }
              >
                <Stack spacing={2}>
                  {courseRows.map((c) => {
                    const pct = c.problemCount > 0 ? Math.round((c.solvedCount / c.problemCount) * 100) : 0;
                    return (
                      <Box
                        key={c.id}
                        component={NextLink}
                        href={`/app/courses/${c.id}`}
                        sx={{
                          display: "block", textDecoration: "none", p: 1.5, borderRadius: 2,
                          border: "1px solid", borderColor: "outlineVariant",
                          transition: hoverTransition("background-color", "transform"),
                          "&:hover": { bgcolor: "surfaceContainerHigh", transform: "translateY(-2px)" },
                          "&:active": { transform: "translateY(0)" },
                        }}
                      >
                        <Stack direction="row" alignItems="center" spacing={1.5}>
                          <MenuBookOutlinedIcon sx={{ fontSize: 20, color: "text.secondary", flexShrink: 0 }} />
                          <Typography variant="body2" fontWeight={500} color="text.primary" sx={{ flex: 1 }} noWrap>
                            {c.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "ui-monospace, monospace", flexShrink: 0 }}>
                            {c.solvedCount}/{c.problemCount}
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={pct}
                          color={pct === 100 ? "success" : "primary"}
                          sx={{ height: 4, borderRadius: 2, mt: 1 }}
                          aria-label={`${c.title}: ${c.solvedCount} of ${c.problemCount} problems solved`}
                        />
                      </Box>
                    );
                  })}
                </Stack>
              </SectionCard>
            )}

            {/* Topic Mastery */}
            {topTopics.length > 0 && (
              <SectionCard
                title="Topic Mastery"
                aria-label="Topic mastery progress"
              >
                <Stack spacing={2.5}>
                  {topTopics.map(({ topic, mastery }) => {
                    const pct = Math.min(100, Math.max(0, mastery));
                    const color =
                      pct >= 80
                        ? "success"
                        : pct >= 50
                          ? "primary"
                          : "warning";
                    return (
                      <Box key={topic}>
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          sx={{ mb: 0.75 }}
                        >
                          <Typography
                            variant="body2"
                            sx={{
                              textTransform: "capitalize",
                              fontWeight: 500,
                            }}
                          >
                            {topic}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {pct}%
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={pct}
                          color={color}
                          aria-label={`${topic} mastery: ${pct}%`}
                          sx={{ height: 8, borderRadius: 4 }}
                        />
                      </Box>
                    );
                  })}
                </Stack>
              </SectionCard>
            )}
          </Stack>

          {/* â”€â”€ Right column â”€â”€ */}
          <Stack spacing={3}>
            {/* Activity heatmap */}
            <SectionCard title="Last 28 Days" aria-label="Activity heatmap">
              <ActivityHeatmap heatmap={heatmap} days={28} />
              <Stack
                direction="row"
                spacing={3}
                sx={{ mt: 2, pt: 2, borderTop: "1px solid", borderColor: "outlineVariant" }}
              >
                <Box textAlign="center" flex={1}>
                  <Typography variant="h6" fontWeight={700}>
                    {stats.totalSubs}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Total submissions
                  </Typography>
                </Box>
                <Box textAlign="center" flex={1}>
                  <Typography variant="h6" fontWeight={700}>
                    {stats.acRate}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Acceptance rate
                  </Typography>
                </Box>
              </Stack>
            </SectionCard>

            {/* Due Soon â€” assignments and exams in one list, so "what's next"
                doesn't mean checking two separate screens. */}
            <SectionCard
              title="Due Soon"
              aria-label="Work due soon"
              action={
                <Link
                  component={NextLink}
                  href="/app/assignments"
                  variant="body2"
                  sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                >
                  All <ArrowForwardIcon fontSize="small" />
                </Link>
              }
            >
              {dueSoon.length === 0 ? (
                <EmptyState
                  compact
                  variant="unassigned"
                  title="Nothing due"
                  description="Assignments and exams with a deadline will appear here."
                />
              ) : (
                <Stack spacing={1.5}>
                  {dueSoon.map((item) => {
                    const { text, urgent } = deadlineLabel(item.due);
                    return (
                      <Box
                        key={item.id}
                        component={NextLink}
                        href={item.href}
                        sx={{
                          display: "block",
                          textDecoration: "none",
                          color: "inherit",
                          p: 1.5,
                          borderRadius: radius.sm,
                          border: "1px solid",
                          borderColor: urgent ? "warningContainer" : "outlineVariant",
                          bgcolor: urgent ? "warningContainer" : "transparent",
                          transition: hoverTransition("background-color", "transform"),
                          "&:hover": {
                            bgcolor: urgent ? "warningContainer" : "surfaceContainerHigh",
                            transform: "translateY(-2px)",
                          },
                          "&:active": { transform: "translateY(0)" },
                        }}
                      >
                        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                          <Typography
                            variant="body2"
                            fontWeight={500}
                            color={urgent ? "onWarningContainer" : "text.primary"}
                            sx={{ flex: 1, lineHeight: 1.3 }}
                            noWrap
                          >
                            {item.title}
                          </Typography>
                          {item.kind === "exam" ? (
                            <TimerOutlinedIcon
                              fontSize="small"
                              sx={{ color: urgent ? "onWarningContainer" : "text.secondary", flexShrink: 0 }}
                            />
                          ) : urgent ? (
                            <WarningAmberOutlinedIcon
                              fontSize="small"
                              sx={{ color: "onWarningContainer", flexShrink: 0 }}
                            />
                          ) : (
                            <AssignmentOutlinedIcon
                              fontSize="small"
                              sx={{ color: "text.secondary", flexShrink: 0 }}
                            />
                          )}
                        </Stack>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 0.75 }}>
                          <Typography variant="caption" color={urgent ? "onWarningContainer" : "text.secondary"}>
                            {text} Â· {item.detail}
                          </Typography>
                          {item.kind === "exam" && (
                            <Chip
                              label="Exam"
                              size="small"
                              sx={{ height: 18, bgcolor: "tertiaryContainer", color: "onTertiaryContainer" }}
                            />
                          )}
                        </Stack>
                        {item.progress !== null && (
                          <LinearProgress
                            variant="determinate"
                            value={item.progress}
                            color={urgent ? "warning" : "primary"}
                            sx={{ height: 4, borderRadius: radius.xs, mt: 1 }}
                            aria-label={`${item.title}: ${item.progress}% complete`}
                          />
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </SectionCard>

            {/* Recommended Problems */}
            {topRecs.length > 0 && (
              <SectionCard
                title="Recommended for You"
                aria-label="Recommended problems"
                action={
                  <Chip
                    icon={<TipsAndUpdatesOutlinedIcon sx={{ fontSize: "0.9rem !important" }} />}
                    label="Adaptive"
                    size="small"
                    sx={{
                      bgcolor: "tertiaryContainer",
                      color: "onTertiaryContainer",
                      "& .MuiChip-icon": { color: "inherit" },
                    }}
                  />
                }
              >
                <List disablePadding>
                  {topRecs.map((rec, idx) => (
                    <React.Fragment key={String(rec.id)}>
                      {idx > 0 && <Divider component="li" />}
                      <ListItem disablePadding>
                        <ListItemButton
                          component={NextLink}
                          href={`/app/problems/${rec.id}`}
                          sx={{ px: 1, py: 1, borderRadius: 2 }}
                        >
                          <ListItemText
                            primary={rec.title}
                            slotProps={{
                              primary: { variant: "body2", noWrap: true },
                            }}
                          />
                          <Box sx={{ ml: 1, flexShrink: 0 }}>
                            <DifficultyChip difficulty={rec.difficulty} />
                          </Box>
                        </ListItemButton>
                      </ListItem>
                    </React.Fragment>
                  ))}
                </List>
                <Button
                  component={NextLink}
                  href="/app/problems"
                  variant="outlined"
                  fullWidth
                  endIcon={<ArrowForwardIcon />}
                  sx={{ mt: 1.5 }}
                >
                  Browse all problems
                </Button>
              </SectionCard>
            )}
          </Stack>
        </Box>
      )}

      {/* Sidebar for new users: quick assignment preview */}
      {isNewUser && upcomingAssignments.length > 0 && (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>
              Upcoming Assignments
            </Typography>
            <Stack spacing={1}>
              {upcomingAssignments.slice(0, 3).map((a) => {
                const { text, urgent } = deadlineLabel(a.deadline);
                return (
                  <Stack
                    key={a.id}
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                      {a.title}
                    </Typography>
                    <Typography
                      variant="caption"
                      color={urgent ? "warning.main" : "text.secondary"}
                      sx={{ ml: 2, flexShrink: 0 }}
                    >
                      {text}
                    </Typography>
                  </Stack>
                );
              })}
            </Stack>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
