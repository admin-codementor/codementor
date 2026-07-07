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
import Tooltip from "@mui/material/Tooltip";
import Link from "@mui/material/Link";
import { ArrowForwardIcon, CodeOutlinedIcon, LocalFireDepartmentOutlinedIcon, EmojiEventsOutlinedIcon, LeaderboardOutlinedIcon, TipsAndUpdatesOutlinedIcon, AssignmentOutlinedIcon, WarningAmberOutlinedIcon, CheckCircleOutlinedIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { getUser } from "@/lib/auth";
import { languageName } from "@/lib/languages";
import { PageHeader } from "@/components/ui/PageHeader";
import { Reveal } from "@/components/ui/motion";
import { StatCard } from "@/components/ui/StatCard";
import { DifficultyChip } from "@/components/ui/DifficultyChip";
import { VerdictChip } from "@/components/ui/VerdictChip";
import { EmptyState, ErrorState } from "@/components/ui/States";
import type {
  DashboardData,
  Assignment,
  RecommendedProblem,
} from "@/lib/types";

// ── Utilities ─────────────────────────────────────────────────────────────────

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

// ── Section card wrapper ──────────────────────────────────────────────────────

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

// ── Activity heatmap (last 28 days) ──────────────────────────────────────────

function ActivityHeatmap({
  heatmap,
}: {
  heatmap: Array<{ date: string; count: number }>;
}) {
  const cells = React.useMemo(() => {
    const map = new Map(heatmap.map((h) => [h.date, h.count]));
    const today = new Date();
    return Array.from({ length: 28 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (27 - i));
      const date = d.toISOString().split("T")[0];
      return { date, count: map.get(date) ?? 0 };
    });
  }, [heatmap]);

  function level(count: number) {
    if (count === 0) return 0;
    if (count <= 2) return 1;
    if (count <= 5) return 2;
    return 3;
  }

  // Monotonic primary-hue intensity ramp (empty → strongest). The mid step is a
  // color-mix between the container and main roles so the gradient reads as one hue.
  const bgByLevel = [
    "surfaceContainerHighest",
    "primaryContainer",
    "color-mix(in srgb, var(--mui-palette-primary-main) 55%, var(--mui-palette-primaryContainer))",
    "primary.main",
  ];

  return (
    <Box>
      <Box
        role="img"
        aria-label="Activity heatmap for the last 28 days"
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(28, 1fr)",
          gap: "3px",
        }}
      >
        {cells.map(({ date, count }) => (
          <Tooltip
            key={date}
            title={
              count === 0
                ? `No submissions on ${date}`
                : `${count} submission${count !== 1 ? "s" : ""} on ${date}`
            }
            arrow
          >
            <Box
              sx={{
                aspectRatio: "1",
                borderRadius: 0.5,
                bgcolor: bgByLevel[level(count)],
              }}
            />
          </Tooltip>
        ))}
      </Box>
      <Stack
        direction="row"
        justifyContent="flex-end"
        alignItems="center"
        spacing={0.75}
        sx={{ mt: 1 }}
      >
        <Typography variant="caption" color="text.secondary">
          Less
        </Typography>
        {bgByLevel.map((bg, i) => (
          <Box
            key={i}
            aria-hidden
            sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: bg }}
          />
        ))}
        <Typography variant="caption" color="text.secondary">
          More
        </Typography>
      </Stack>
    </Box>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

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

// ── Main page ─────────────────────────────────────────────────────────────────

interface PageData {
  dashboard: DashboardData;
  assignments: Assignment[];
  recommendations: RecommendedProblem[];
}

export default function DashboardPage() {
  const [name, setName] = React.useState("");
  const [data, setData] = React.useState<PageData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    setName(getUser()?.name?.split(" ")[0] ?? "");
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [dashRes, assignRes, recRes] = await Promise.allSettled([
        api.get<{ success: boolean; data: DashboardData }>(
          "/api/student/dashboard"
        ),
        api.get<{ success: boolean; data: Assignment[] }>(
          "/api/student/assignments"
        ),
        api.get<{ success: boolean; data: RecommendedProblem[] }>(
          "/api/student/recommendations"
        ),
      ]);

      if (dashRes.status === "rejected") {
        setError(true);
        return;
      }

      setData({
        dashboard: dashRes.value.data.data,
        assignments:
          assignRes.status === "fulfilled"
            ? assignRes.value.data.data ?? []
            : [],
        recommendations:
          recRes.status === "fulfilled" ? recRes.value.data.data ?? [] : [],
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  if (loading) return <DashboardSkeleton />;
  if (error || !data)
    return (
      <ErrorState
        title="Couldn't load your dashboard"
        description="Check your connection and try again."
        onRetry={load}
      />
    );

  const { dashboard, assignments, recommendations } = data;
  const { stats, topics, recentSubmissions, heatmap } = dashboard;
  const isNewUser = stats.totalSubs === 0;

  // Sort assignments by deadline, only show ones with a deadline
  const upcomingAssignments = assignments
    .filter((a) => a.deadline)
    .sort(
      (a, b) =>
        new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
    )
    .slice(0, 5);

  const topTopics = topics.slice(0, 6);
  const topRecs = recommendations.slice(0, 5);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <Box>
      <PageHeader
        title={name ? `${greeting}, ${name}!` : greeting + "!"}
        subtitle={
          isNewUser
            ? "Ready to start your coding journey? Pick a problem and dive in."
            : `You've solved ${stats.problemsSolved} problem${stats.problemsSolved !== 1 ? "s" : ""} and you're on a ${stats.streak}-day streak. Keep going!`
        }
      />

      {/* ── Stats row ── */}
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
          helper={stats.streak >= 3 ? "On fire!" : undefined}
          accent="warning"
        />
        <StatCard
          icon={<LeaderboardOutlinedIcon />}
          label="Class Rank"
          value={stats.rank > 0 ? `#${stats.rank}` : "—"}
          accent="secondary"
        />
        <StatCard
          icon={<EmojiEventsOutlinedIcon />}
          label="Contest Rating"
          value={stats.rating}
          accent="tertiary"
        />
      </Box>
      </Reveal>

      {/* ── New-user empty state ── */}
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

      {/* ── Content grid ── */}
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
          {/* ── Left column ── */}
          <Stack spacing={3}>
            {/* Recent Submissions */}
            <SectionCard
              title="Recent Submissions"
              aria-label="Recent submissions"
              action={
                <Link
                  component={NextLink}
                  href="/app/profile?tab=submissions"
                  variant="body2"
                  sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                >
                  View all <ArrowForwardIcon sx={{ fontSize: 16 }} />
                </Link>
              }
            >
              {recentSubmissions.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                  No submissions yet.
                </Typography>
              ) : (
                <List disablePadding>
                  {recentSubmissions.map((sub, idx) => (
                    <React.Fragment key={`${sub.problem_id}-${sub.created_at}-${idx}`}>
                      {idx > 0 && <Divider component="li" />}
                      <ListItem disablePadding>
                        <ListItemButton
                          component={NextLink}
                          href={`/app/problems/${sub.problem_id}`}
                          sx={{ px: 1, py: 1.25, borderRadius: 2, overflow: "hidden" }}
                        >
                          <ListItemText
                            primary={sub.problem_title}
                            secondary={`${languageName(sub.language)} · ${timeAgo(sub.created_at)}`}
                            sx={{ minWidth: 0, mr: 1 }}
                            slotProps={{
                              primary: { variant: "body2", fontWeight: 500, noWrap: true },
                              secondary: { variant: "caption", noWrap: true },
                            }}
                          />
                          <Box sx={{ flexShrink: 0 }}>
                            <VerdictChip verdict={sub.verdict} />
                          </Box>
                        </ListItemButton>
                      </ListItem>
                    </React.Fragment>
                  ))}
                </List>
              )}
            </SectionCard>

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

          {/* ── Right column ── */}
          <Stack spacing={3}>
            {/* Activity heatmap */}
            <SectionCard title="Last 28 Days" aria-label="Activity heatmap">
              <ActivityHeatmap heatmap={heatmap} />
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

            {/* Upcoming Assignments */}
            {upcomingAssignments.length > 0 && (
              <SectionCard
                title="Upcoming Assignments"
                aria-label="Upcoming assignments"
                action={
                  <Link
                    component={NextLink}
                    href="/app/assignments"
                    variant="body2"
                    sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                  >
                    All <ArrowForwardIcon sx={{ fontSize: 16 }} />
                  </Link>
                }
              >
                <Stack spacing={1.5}>
                  {upcomingAssignments.map((a) => {
                    const { text, urgent } = deadlineLabel(a.deadline);
                    const progress =
                      a.total > 0
                        ? Math.round((a.solved / a.total) * 100)
                        : 0;
                    const done = a.solved === a.total && a.total > 0;
                    return (
                      <Box
                        key={a.id}
                        component={NextLink}
                        href="/app/assignments"
                        sx={{
                          display: "block",
                          textDecoration: "none",
                          p: 1.5,
                          borderRadius: 2,
                          border: "1px solid",
                          borderColor: urgent
                            ? "errorContainer"
                            : "outlineVariant",
                          bgcolor: urgent ? "errorContainer" : "transparent",
                          "&:hover": { bgcolor: urgent ? "errorContainer" : "surfaceContainerHigh" },
                          transition: "background-color 150ms",
                        }}
                      >
                        <Stack
                          direction="row"
                          alignItems="flex-start"
                          justifyContent="space-between"
                          spacing={1}
                        >
                          <Typography
                            variant="body2"
                            fontWeight={500}
                            color={urgent ? "onErrorContainer" : "text.primary"}
                            sx={{ flex: 1, lineHeight: 1.3 }}
                            noWrap
                          >
                            {a.title}
                          </Typography>
                          {done ? (
                            <CheckCircleOutlinedIcon
                              sx={{ fontSize: 18, color: "success.main", flexShrink: 0 }}
                            />
                          ) : urgent ? (
                            <WarningAmberOutlinedIcon
                              sx={{
                                fontSize: 18,
                                color: "onErrorContainer",
                                flexShrink: 0,
                              }}
                            />
                          ) : (
                            <AssignmentOutlinedIcon
                              sx={{
                                fontSize: 18,
                                color: "text.secondary",
                                flexShrink: 0,
                              }}
                            />
                          )}
                        </Stack>
                        <Stack
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          sx={{ mt: 0.75 }}
                        >
                          <Typography
                            variant="caption"
                            color={urgent ? "onErrorContainer" : "text.secondary"}
                          >
                            {text} · {a.solved}/{a.total} solved
                          </Typography>
                          {a.isExam && (
                            <Chip
                              label="Exam"
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: "0.65rem",
                                bgcolor: "tertiaryContainer",
                                color: "onTertiaryContainer",
                              }}
                            />
                          )}
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={progress}
                          color={done ? "success" : urgent ? "error" : "primary"}
                          sx={{ height: 4, borderRadius: 2, mt: 1 }}
                          aria-label={`${a.title}: ${a.solved} of ${a.total} problems solved`}
                        />
                      </Box>
                    );
                  })}
                </Stack>
              </SectionCard>
            )}

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
                      color={urgent ? "error.main" : "text.secondary"}
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
