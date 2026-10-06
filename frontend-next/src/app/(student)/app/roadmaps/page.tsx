"use client";

import * as React from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import { WaypointsIcon, ArrowForwardIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { CardGridSkeleton } from "@/components/ui/Skeletons";
import { interactiveSurfaceSx } from "@/components/ui/interactive";
import { Reveal } from "@/components/ui/motion";
import { layout } from "@/theme/tokens";
import { useRoadmapsQuery, type RoadmapSummary } from "@/lib/queries/roadmaps";

// Matches a loaded card closely enough that the grid does not jump.
const CARD_HEIGHT = 150;

function RoadmapCard({ roadmap, active }: { roadmap: RoadmapSummary; active: boolean }) {
  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: active ? "primary.main" : "outlineVariant",
        height: "100%",
        ...interactiveSurfaceSx,
      }}
    >
      <CardActionArea
        component={NextLink}
        href={`/app/roadmaps/${roadmap.id}`}
        sx={{ p: layout.cardPadding, height: "100%", borderRadius: "inherit" }}
      >
        <Stack spacing={1.5} sx={{ height: "100%" }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                {roadmap.role}
              </Typography>
              {roadmap.tagline && (
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                  {roadmap.tagline}
                </Typography>
              )}
            </Box>
            {active && <Chip size="small" color="primary" label="Following" icon={<WaypointsIcon />} />}
          </Stack>

          {roadmap.summary && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
            >
              {roadmap.summary}
            </Typography>
          )}

          <Box sx={{ flex: 1 }} />

          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Typography variant="caption" color="text.secondary">
              {roadmap.milestoneCount} steps
            </Typography>
            <Stack direction="row" spacing={0.25} alignItems="center" sx={{ flexShrink: 0, color: "primary.main" }}>
              <Typography variant="caption" fontWeight={600}>
                View roadmap
              </Typography>
              <ArrowForwardIcon sx={{ fontSize: 14 }} />
            </Stack>
          </Stack>
        </Stack>
      </CardActionArea>
    </Card>
  );
}

export default function RoadmapsPage() {
  const query = useRoadmapsQuery();
  const roadmaps = query.data?.roadmaps ?? [];
  const activeId = query.data?.activeRoadmapId ?? null;

  return (
    <Box>
      <PageHeader
        title="Roadmaps"
        subtitle="A path per career role, with the topics and resources for each step."
      />

      <DataState
        loading={query.isLoading}
        fetching={query.isFetching && !query.isLoading}
        error={query.isError ? query.error : undefined}
        empty={roadmaps.length === 0}
        onRetry={query.refetch}
        skeleton={<CardGridSkeleton count={4} height={CARD_HEIGHT} />}
        emptyTitle="No roadmaps yet"
        emptyDescription="Roadmaps for the roles your college recruits for will appear here."
      >
        <Reveal>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: layout.sectionGap,
            }}
          >
            {roadmaps.map((r) => (
              <RoadmapCard key={r.id} roadmap={r} active={r.id === activeId} />
            ))}
          </Box>
        </Reveal>
      </DataState>
    </Box>
  );
}
