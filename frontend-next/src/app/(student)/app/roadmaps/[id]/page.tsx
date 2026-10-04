"use client";

import * as React from "react";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import ButtonBase from "@mui/material/ButtonBase";
import MuiLink from "@mui/material/Link";
import {
  WaypointsIcon,
  CheckCircleIcon,
  RadioButtonUncheckedIcon,
  MenuBookOutlinedIcon,
  TimerOutlinedIcon,
  ArrowBackIcon,
  ArrowForwardIcon,
  ExpandMoreIcon,
  LinkOutlinedIcon,
} from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { ListSkeleton } from "@/components/ui/Skeletons";
import { DifficultyChip } from "@/components/ui/DifficultyChip";
import { useToast } from "@/components/feedback/ToastProvider";
import { radius, layout } from "@/theme/tokens";
import {
  useRoadmapQuery,
  useSetActiveRoadmap,
  milestoneHref,
  mcqHref,
  type Milestone,
} from "@/lib/queries/roadmaps";

/** The dot on the rail. Its shape alone should say where the student stands. */
function StatusDot({ milestone, current }: { milestone: Milestone; current: boolean }) {
  const done = milestone.tracked && milestone.status === "done";
  const icon = done ? (
    <CheckCircleIcon fontSize="small" />
  ) : !milestone.tracked ? (
    milestone.status === "test" ? (
      <TimerOutlinedIcon fontSize="small" />
    ) : (
      <MenuBookOutlinedIcon fontSize="small" />
    )
  ) : (
    <RadioButtonUncheckedIcon fontSize="small" />
  );

  return (
    <Box
      aria-hidden
      sx={{
        width: 32,
        height: 32,
        flexShrink: 0,
        borderRadius: radius.circle,
        display: "grid",
        placeItems: "center",
        zIndex: 1,
        color: done ? "success.contrastText" : current ? "onPrimaryContainer" : "text.secondary",
        backgroundColor: done ? "success.main" : current ? "primaryContainer" : "surfaceContainerHigh",
        border: current && !done ? "2px solid var(--mui-palette-primary-main)" : "2px solid transparent",
      }}
    >
      {icon}
    </Box>
  );
}

function MilestoneRow({
  milestone,
  index,
  last,
  current,
  expanded,
  onToggle,
}: {
  milestone: Milestone;
  index: number;
  last: boolean;
  current: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const done = milestone.tracked && milestone.status === "done";
  const href = milestoneHref(milestone);

  return (
    <Box sx={{ display: "flex", gap: 2, position: "relative" }}>
      {/* Rail */}
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <StatusDot milestone={milestone} current={current} />
        {!last && (
          <Box
            aria-hidden
            sx={{
              flex: 1,
              width: 2,
              minHeight: 16,
              my: 0.5,
              backgroundColor: done ? "success.main" : "outlineVariant",
            }}
          />
        )}
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, minWidth: 0, pb: last ? 0 : layout.sectionGap }}>
        <ButtonBase
          onClick={onToggle}
          aria-expanded={expanded}
          sx={{
            width: "100%",
            textAlign: "left",
            justifyContent: "flex-start",
            borderRadius: radius.sm,
            px: 1,
            mx: -1,
            py: 0.5,
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ width: "100%" }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                variant="subtitle1"
                fontWeight={current ? 700 : 600}
                sx={{ lineHeight: 1.3, color: done ? "text.secondary" : "text.primary" }}
              >
                <Box component="span" sx={{ color: "text.secondary", mr: 1 }}>
                  {index + 1}.
                </Box>
                {milestone.title}
              </Typography>
            </Box>

            {milestone.tracked ? (
              milestone.status === "unavailable" ? (
                <Chip size="small" variant="outlined" label="No problems yet" />
              ) : (
                <Typography
                  variant="caption"
                  fontWeight={600}
                  color={done ? "success.main" : "text.secondary"}
                  sx={{ whiteSpace: "nowrap" }}
                >
                  {milestone.solved} / {milestone.target}
                </Typography>
              )
            ) : (
              <Chip
                size="small"
                variant="outlined"
                label={milestone.status === "test" ? "Test" : "Reading"}
              />
            )}

            <ExpandMoreIcon
              fontSize="small"
              sx={{
                color: "text.secondary",
                transition: "transform 150ms",
                transform: expanded ? "rotate(180deg)" : "none",
              }}
            />
          </Stack>
        </ButtonBase>

        {current && (
          <Chip size="small" color="primary" label="You are here" sx={{ mt: 0.5, ml: 0.5 }} />
        )}

        {expanded && (
          <Box sx={{ mt: 1.5 }}>
            {milestone.why && (
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: layout.proseMaxWidth }}>
                {milestone.why}
              </Typography>
            )}

            {milestone.tracked && milestone.target > 0 && (
              <Box sx={{ mt: 1.5, maxWidth: 360 }}>
                <LinearProgress
                  variant="determinate"
                  value={milestone.percent}
                  color={done ? "success" : "primary"}
                  sx={{ height: 6, borderRadius: radius.full }}
                />
              </Box>
            )}

            {/* Next up */}
            {milestone.tracked && milestone.nextProblems.length > 0 && (
              <Stack spacing={0.5} sx={{ mt: 2 }}>
                <Typography variant="overline" color="text.secondary">
                  Next up
                </Typography>
                {milestone.nextProblems.map((p) => (
                  <Card
                    key={p.id}
                    variant="outlined"
                    sx={{ borderColor: "outlineVariant", borderRadius: radius.sm }}
                  >
                    <ButtonBase
                      component={NextLink}
                      href={`/app/problems/${p.id}`}
                      sx={{
                        width: "100%",
                        px: 1.5,
                        py: 1,
                        justifyContent: "space-between",
                        borderRadius: "inherit",
                      }}
                    >
                      <Typography variant="body2" noWrap sx={{ mr: 1 }}>
                        {p.title}
                      </Typography>
                      {p.difficulty && <DifficultyChip difficulty={p.difficulty} />}
                    </ButtonBase>
                  </Card>
                ))}
              </Stack>
            )}

            {/* Reference material */}
            {milestone.reading.length > 0 && (
              <Stack spacing={0.5} sx={{ mt: 2 }}>
                <Typography variant="overline" color="text.secondary">
                  Reference
                </Typography>
                {milestone.reading.map((r) => (
                  <Stack key={r.url} direction="row" spacing={0.75} alignItems="center">
                    <LinkOutlinedIcon fontSize="small" sx={{ color: "text.secondary" }} />
                    <MuiLink href={r.url} target="_blank" rel="noopener noreferrer" variant="body2">
                      {r.label}
                    </MuiLink>
                  </Stack>
                ))}
              </Stack>
            )}

            {/* Where to go */}
            <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
              {href && (
                <Button
                  component={NextLink}
                  href={href}
                  variant={current ? "contained" : "outlined"}
                  size="small"
                  endIcon={<ArrowForwardIcon />}
                >
                  {milestone.tracked && milestone.link?.kind === "module"
                    ? `Open ${milestone.link.moduleTitle}`
                    : "Practise this"}
                </Button>
              )}
              {!milestone.tracked && milestone.status === "test" && (
                <Button
                  component={NextLink}
                  href={mcqHref(milestone.mcq)}
                  variant={current ? "contained" : "outlined"}
                  size="small"
                  endIcon={<ArrowForwardIcon />}
                >
                  Go to Tests
                </Button>
              )}
            </Stack>

            {!milestone.tracked && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
                {milestone.status === "test"
                  ? "Test rounds are not counted in the percentage above — we score attempts, not readiness."
                  : "We cannot check whether you have read this, so it does not count towards your progress."}
              </Typography>
            )}

            {milestone.tracked && milestone.status === "unavailable" && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
                Your college has not added problems for this topic yet. It will start counting as soon as it does.
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default function RoadmapDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const query = useRoadmapQuery(id);
  const setActive = useSetActiveRoadmap();
  const showToast = useToast();

  const roadmap = query.data?.roadmap;
  const isActive = query.data?.isActive ?? false;
  const currentId = roadmap?.currentMilestone?.id ?? null;

  // Open the current step on arrival; everything else starts collapsed, which is
  // the point of a roadmap — one thing to do next, not eleven.
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [openedFor, setOpenedFor] = React.useState<string | null>(null);
  if (currentId && openedFor !== currentId) {
    setOpenedFor(currentId);
    setExpanded(new Set([currentId]));
  }

  const toggle = (mid: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(mid)) next.delete(mid);
      else next.add(mid);
      return next;
    });

  const follow = () => {
    setActive.mutate(isActive ? null : id, {
      onSuccess: () =>
        showToast(isActive ? "Stopped following this roadmap" : `Following ${roadmap?.role}`),
      onError: () => showToast("Could not save that choice", { severity: "error" }),
    });
  };

  return (
    <Box>
      <Button
        component={NextLink}
        href="/app/roadmaps"
        startIcon={<ArrowBackIcon />}
        size="small"
        sx={{ mb: 1 }}
      >
        All roadmaps
      </Button>

      <DataState
        loading={query.isLoading}
        fetching={query.isFetching && !query.isLoading}
        error={query.isError ? query.error : undefined}
        onRetry={query.refetch}
        skeleton={<ListSkeleton rows={6} />}
      >
        {roadmap && (
          <>
            <PageHeader
              title={roadmap.role}
              subtitle={roadmap.tagline ?? undefined}
              actions={
                <Button
                  variant={isActive ? "outlined" : "contained"}
                  startIcon={<WaypointsIcon />}
                  onClick={follow}
                  disabled={setActive.isPending}
                >
                  {isActive ? "Following" : "Follow this roadmap"}
                </Button>
              }
            />

            <Card
              variant="outlined"
              sx={{ borderColor: "outlineVariant", p: layout.cardPadding, mb: layout.sectionGap }}
            >
              {roadmap.summary && (
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: layout.proseMaxWidth }}>
                  {roadmap.summary}
                </Typography>
              )}
              {roadmap.forWho && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                  {roadmap.forWho}
                </Typography>
              )}

              <Box sx={{ mt: 2.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.75 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {roadmap.currentStep
                      ? `Step ${roadmap.currentStep} of ${roadmap.trackedCount}`
                      : `All ${roadmap.trackedCount} steps complete`}
                  </Typography>
                  <Typography variant="body2" fontWeight={700}>
                    {roadmap.percent}%
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={roadmap.percent}
                  sx={{ height: 8, borderRadius: radius.full }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                  Counted across the practice steps below, weighted by how much work each one asks
                  for. Reading and test steps are listed but not counted.
                </Typography>
              </Box>
            </Card>

            <Box>
              {roadmap.milestones.map((m, i) => (
                <MilestoneRow
                  key={m.id}
                  milestone={m}
                  index={i}
                  last={i === roadmap.milestones.length - 1}
                  current={m.id === currentId}
                  expanded={expanded.has(m.id)}
                  onToggle={() => toggle(m.id)}
                />
              ))}
            </Box>
          </>
        )}
      </DataState>
    </Box>
  );
}
