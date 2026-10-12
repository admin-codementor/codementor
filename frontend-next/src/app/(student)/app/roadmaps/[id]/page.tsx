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
import ButtonBase from "@mui/material/ButtonBase";
import MuiLink from "@mui/material/Link";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import {
  WaypointsIcon,
  RadioButtonUncheckedIcon,
  MenuBookOutlinedIcon,
  TimerOutlinedIcon,
  ArrowBackIcon,
  ExpandMoreIcon,
  LinkOutlinedIcon,
} from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { ListSkeleton } from "@/components/ui/Skeletons";
import { useToast } from "@/components/feedback/ToastProvider";
import { radius, layout } from "@/theme/tokens";
import { useRoadmapQuery, useSetActiveRoadmap, type Milestone } from "@/lib/queries/roadmaps";
import { RoadmapGraph } from "@/components/roadmap/RoadmapGraph";
import { GraphNodeList } from "@/components/roadmap/GraphNodeList";

/**
 * A roadmap page is a map of the path and its resources — not a progress
 * tracker, and never a link into Problems/Practice (D18). The legacy flat-list
 * shape below is dead code today (every roadmap is graph-shaped as of S13
 * Phase B) but kept working for a future roadmap authored without converting.
 */
function StatusDot({ milestone }: { milestone: Milestone }) {
  const icon = !milestone.tracked && milestone.status === "test" ? (
    <TimerOutlinedIcon fontSize="small" />
  ) : !milestone.tracked ? (
    <MenuBookOutlinedIcon fontSize="small" />
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
        color: "text.secondary",
        backgroundColor: "surfaceContainerHigh",
        border: "2px solid transparent",
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
  expanded,
  onToggle,
}: {
  milestone: Milestone;
  index: number;
  last: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Box sx={{ display: "flex", gap: 2, position: "relative" }}>
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <StatusDot milestone={milestone} />
        {!last && (
          <Box aria-hidden sx={{ flex: 1, width: 2, minHeight: 16, my: 0.5, backgroundColor: "outlineVariant" }} />
        )}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, pb: last ? 0 : layout.sectionGap }}>
        <ButtonBase
          onClick={onToggle}
          aria-expanded={expanded}
          sx={{ width: "100%", textAlign: "left", justifyContent: "flex-start", borderRadius: radius.sm, px: 1, mx: -1, py: 0.5 }}
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ width: "100%" }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                <Box component="span" sx={{ color: "text.secondary", mr: 1 }}>
                  {index + 1}.
                </Box>
                {milestone.title}
              </Typography>
            </Box>

            {!milestone.tracked && (
              <Chip size="small" variant="outlined" label={milestone.status === "test" ? "Test" : "Reading"} />
            )}

            <ExpandMoreIcon
              fontSize="small"
              sx={{ color: "text.secondary", transition: "transform 150ms", transform: expanded ? "rotate(180deg)" : "none" }}
            />
          </Stack>
        </ButtonBase>

        {expanded && (
          <Box sx={{ mt: 1.5 }}>
            {milestone.why && (
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: layout.proseMaxWidth }}>
                {milestone.why}
              </Typography>
            )}

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
  const theme = useTheme();
  // A pan/zoom canvas does not work at phone width — same threshold AppShell
  // already uses to decide desktop vs mobile chrome.
  const isWideEnoughForGraph = useMediaQuery(theme.breakpoints.up("md"));

  const roadmap = query.data?.roadmap;
  const isActive = query.data?.isActive ?? false;

  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
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
            </Card>

            {roadmap.format === "graph" ? (
              isWideEnoughForGraph ? (
                <RoadmapGraph roadmap={roadmap} />
              ) : (
                <GraphNodeList roadmap={roadmap} />
              )
            ) : (
              <Box>
                {roadmap.milestones.map((m, i) => (
                  <MilestoneRow
                    key={m.id}
                    milestone={m}
                    index={i}
                    last={i === roadmap.milestones.length - 1}
                    expanded={expanded.has(m.id)}
                    onToggle={() => toggle(m.id)}
                  />
                ))}
              </Box>
            )}
          </>
        )}
      </DataState>
    </Box>
  );
}
