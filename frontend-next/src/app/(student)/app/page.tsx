"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { DataState } from "@/components/ui/DataState";
import { CardGridSkeleton } from "@/components/ui/Skeletons";
import { QuickAccessGrid } from "@/components/student/quick-access/QuickAccessGrid";
import { getUser } from "@/lib/auth";
import { useAvailableExamsQuery, useDashboardQuery, useSkillsQuery, genuineWeaknesses } from "@/lib/queries/student";
import { useRoadmapsQuery } from "@/lib/queries/roadmaps";

/**
 * Home — where a student lands after signing in.
 *
 * Six illustrated tiles and nothing else, on the pattern of the screen the HOD
 * liked. No sidebar (see `HomeShell`), no statistics, no greeting band: the
 * point of a launchpad is that there are six things on it.
 *
 * One difference from the screen it is modelled on: each tile's caption is live
 * rather than "click here to view your tests". "Profiling Test-1 is live now"
 * is worth the space; a label repeating the button under it is not.
 */

function greetingFor(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useDashboardQuery();
  const { data: exams } = useAvailableExamsQuery();
  const { data: roadmapData } = useRoadmapsQuery();
  // Feeds the Practice tile's line (S12). A failure here just falls back to
  // the tile's streak wording — it must not affect the rest of Home.
  const { data: skillsData } = useSkillsQuery();

  const [name, setName] = React.useState("");
  const [className, setClassName] = React.useState<string | null>(null);
  React.useEffect(() => {
    const user = getUser();
    setName(user?.name?.split(" ")[0] ?? "");
    // "CSE-A" reads as the student's class without another request.
    setClassName(user?.department ? [user.department, user.section].filter(Boolean).join("-") : null);
  }, []);

  // Read once per mount: the greeting must not change mid-session, and reading
  // the clock during render is not allowed.
  const [greeting] = React.useState(() => greetingFor(new Date().getHours()));

  const activeRoadmap =
    roadmapData?.roadmaps.find((r) => r.id === roadmapData.activeRoadmapId) ?? null;
  const weakestTopic = genuineWeaknesses(skillsData?.weaknesses ?? [])[0] ?? null;

  return (
    <Box>
      {/* One quiet line rather than the gradient band this page used to open
          with. The tiles are the content; a hero above them just pushes the
          third row off the screen. */}
      <Typography variant="h6" component="h1" fontWeight={600} sx={{ mb: { xs: 2, sm: 3 } }}>
        {name ? `${greeting}, ${name}` : greeting}
      </Typography>

      <DataState
        loading={isLoading}
        fetching={isFetching && !isLoading}
        error={isError ? error : undefined}
        onRetry={refetch}
        skeleton={<CardGridSkeleton count={6} height={280} minWidth={260} />}
      >
        <QuickAccessGrid
          stats={data?.dashboard?.stats}
          courses={data?.courses ?? []}
          assignments={data?.assignments ?? []}
          exams={exams ?? []}
          className={className}
          activeRoadmap={activeRoadmap}
          weakestTopic={weakestTopic}
        />
      </DataState>
    </Box>
  );
}
