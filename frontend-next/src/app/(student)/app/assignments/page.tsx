"use client";

import * as React from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Collapse from "@mui/material/Collapse";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Skeleton from "@mui/material/Skeleton";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Divider from "@mui/material/Divider";
import { ExpandMoreIcon, CheckCircleIcon, RadioButtonUncheckedIcon, AssignmentOutlinedIcon, AccessTimeIcon, WarningAmberIcon, ArrowForwardIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { DifficultyChip } from "@/components/ui/DifficultyChip";
import { EmptyState, ErrorState } from "@/components/ui/States";
import type { Assignment } from "@/lib/types";

const FILTERS = ["all", "pending", "completed"] as const;
type Filter = (typeof FILTERS)[number];

function daysLeft(deadline: string): number {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
}

function isComplete(a: Assignment): boolean {
  return a.total > 0 && a.solved === a.total;
}

function isOverdue(a: Assignment): boolean {
  return daysLeft(a.deadline) < 0 && !isComplete(a);
}

// ── Deadline pill ─────────────────────────────────────────────────────────────

function DeadlineBadge({ deadline }: { deadline: string }) {
  const days = daysLeft(deadline);
  let color: "error.main" | "warning.main" | "text.secondary" = "text.secondary";
  let text: string;
  if (days < 0) {
    color = "error.main";
    text = "Overdue";
  } else if (days === 0) {
    color = "warning.main";
    text = "Due today";
  } else if (days <= 2) {
    color = "warning.main";
    text = `${days}d left`;
  } else {
    text = `${days}d left`;
  }
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color }}>
      {days < 0 ? (
        <WarningAmberIcon sx={{ fontSize: 15 }} />
      ) : (
        <AccessTimeIcon sx={{ fontSize: 15 }} />
      )}
      <Typography variant="caption" fontWeight={days <= 2 ? 600 : 400}>
        {text}
      </Typography>
    </Stack>
  );
}

// ── Progress ring ─────────────────────────────────────────────────────────────

function ProgressRing({ pct, color }: { pct: number; color: string }) {
  return (
    <Box sx={{ position: "relative", width: 48, height: 48, flexShrink: 0 }}>
      <Box
        component="svg"
        viewBox="0 0 36 36"
        sx={{ width: 48, height: 48, transform: "rotate(-90deg)" }}
      >
        <circle cx="18" cy="18" r="14" fill="none" stroke="var(--mui-palette-outlineVariant)" strokeWidth="3" />
        <Box
          component="circle"
          cx="18"
          cy="18"
          r="14"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={`${pct} ${100 - pct}`}
          pathLength={100}
          strokeLinecap="round"
        />
      </Box>
      <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <Typography variant="caption" fontWeight={700} sx={{ fontSize: 10 }}>
          {pct}%
        </Typography>
      </Box>
    </Box>
  );
}

// ── Assignment card ───────────────────────────────────────────────────────────

function AssignmentCard({ assignment }: { assignment: Assignment }) {
  const [expanded, setExpanded] = React.useState(false);
  const pct =
    assignment.total > 0
      ? Math.round((assignment.solved / assignment.total) * 100)
      : 0;
  const complete = isComplete(assignment);
  const overdue = isOverdue(assignment);
  const ringColor = complete
    ? "var(--mui-palette-success-main)"
    : overdue
      ? "var(--mui-palette-error-main)"
      : "var(--mui-palette-primary-main)";

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: complete
          ? "success.main"
          : overdue
            ? "error.main"
            : "outlineVariant",
        overflow: "hidden",
      }}
    >
      <Box
        component="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        sx={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 2,
          p: 2,
          border: 0,
          bgcolor: "transparent",
          cursor: "pointer",
          textAlign: "left",
          color: "inherit",
          font: "inherit",
          transition: "background-color 150ms ease",
          "&:hover": { bgcolor: "surfaceContainerHigh" },
        }}
      >
        <ProgressRing pct={pct} color={ringColor} />

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="subtitle1" fontWeight={600} noWrap sx={{ maxWidth: { xs: 180, sm: 360 } }}>
              {assignment.title}
            </Typography>
            {assignment.isExam && (
              <Chip
                label="Proctored Exam"
                size="small"
                sx={{ height: 20, fontSize: 10, fontWeight: 700, bgcolor: "errorContainer", color: "onErrorContainer" }}
              />
            )}
            {complete && (
              <Chip
                label="Complete"
                size="small"
                sx={{ height: 20, fontSize: 10, fontWeight: 700, bgcolor: "successContainer", color: "onSuccessContainer" }}
              />
            )}
          </Stack>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 0.75 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "ui-monospace, monospace" }}>
              {assignment.solved}/{assignment.total} solved
            </Typography>
            <DeadlineBadge deadline={assignment.deadline} />
          </Stack>
        </Box>

        <Box sx={{ display: { xs: "none", md: "block" }, width: 140, flexShrink: 0 }}>
          <LinearProgress
            variant="determinate"
            value={pct}
            color={complete ? "success" : overdue ? "error" : "primary"}
            sx={{ height: 6, borderRadius: 3 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "right", mt: 0.5 }}>
            Due {new Date(assignment.deadline).toLocaleDateString()}
          </Typography>
        </Box>

        <IconButton
          component="span"
          size="small"
          aria-hidden
          sx={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
        >
          <ExpandMoreIcon />
        </IconButton>
      </Box>

      <Collapse in={expanded} unmountOnExit>
        <Divider sx={{ borderColor: "outlineVariant" }} />
        <Box>
          {assignment.problems.map((prob, idx) => (
            <React.Fragment key={prob.id}>
              {idx > 0 && <Divider sx={{ borderColor: "outlineVariant" }} />}
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                sx={{ px: 2, py: 1.5 }}
              >
                {prob.is_solved ? (
                  <CheckCircleIcon sx={{ fontSize: 18, color: "success.main", flexShrink: 0 }} />
                ) : (
                  <RadioButtonUncheckedIcon sx={{ fontSize: 18, color: "outline", flexShrink: 0 }} />
                )}
                <Typography
                  variant="body2"
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    color: prob.is_solved ? "text.secondary" : "text.primary",
                    textDecoration: prob.is_solved ? "line-through" : "none",
                  }}
                  noWrap
                >
                  {prob.title}
                </Typography>
                <DifficultyChip difficulty={prob.difficulty} />
                {!prob.is_solved && (
                  <Link
                    component={NextLink}
                    href={`/app/problems/${prob.id}?assignment=${assignment.id}${assignment.isExam ? "&proctor=1" : ""}`}
                    variant="body2"
                    sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, flexShrink: 0, fontWeight: 500 }}
                  >
                    {assignment.isExam ? "Start Exam" : "Solve"}
                    <ArrowForwardIcon sx={{ fontSize: 15 }} />
                  </Link>
                )}
              </Stack>
            </React.Fragment>
          ))}
        </Box>
      </Collapse>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AssignmentsPage() {
  const [assignments, setAssignments] = React.useState<Assignment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [filter, setFilter] = React.useState<Filter>("all");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get<{ success: boolean; data: Assignment[] }>(
        "/api/student/assignments",
      );
      if (res.data?.success) setAssignments(res.data.data ?? []);
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

  const filtered = assignments.filter((a) => {
    if (filter === "completed") return isComplete(a);
    if (filter === "pending") return !isComplete(a);
    return true;
  });

  const completedCount = assignments.filter(isComplete).length;
  const overdueCount = assignments.filter(isOverdue).length;

  return (
    <Box>
      <PageHeader
        title="Assignments"
        subtitle={
          loading
            ? "Loading your assignments…"
            : `${completedCount}/${assignments.length} completed${overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}`
        }
        actions={
          <SegmentedButtons<Filter>
            value={filter}
            onChange={setFilter}
            segments={FILTERS.map((f) => ({
              value: f,
              label: f.charAt(0).toUpperCase() + f.slice(1),
            }))}
            ariaLabel="Filter assignments"
          />
        }
      />

      {!loading && !error && assignments.length > 0 && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" },
            gap: 2,
            mb: 3,
          }}
        >
          <StatCard icon={<AssignmentOutlinedIcon />} label="Total" value={assignments.length} accent="primary" />
          <StatCard icon={<CheckCircleIcon />} label="Completed" value={completedCount} accent="success" />
          <StatCard icon={<WarningAmberIcon />} label="Overdue" value={overdueCount} accent="error" />
        </Box>
      )}

      {error ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <ErrorState
            title="Couldn't load your assignments"
            description="Check your connection and try again."
            onRetry={load}
          />
        </Card>
      ) : loading ? (
        <Stack spacing={2}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} variant="outlined" sx={{ p: 2, borderColor: "outlineVariant" }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Skeleton variant="circular" width={48} height={48} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton width="35%" height={22} />
                  <Skeleton width="20%" height={16} sx={{ mt: 0.5 }} />
                </Box>
              </Stack>
            </Card>
          ))}
        </Stack>
      ) : filtered.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState
            icon={<AssignmentOutlinedIcon />}
            title={filter === "all" ? "No assignments yet" : `No ${filter} assignments`}
            description={
              filter === "all"
                ? "Your instructor hasn't assigned any work yet."
                : `You have no ${filter} assignments right now.`
            }
          />
        </Card>
      ) : (
        <Stack spacing={2}>
          {filtered.map((a) => (
            <AssignmentCard key={a.id} assignment={a} />
          ))}
        </Stack>
      )}
    </Box>
  );
}
