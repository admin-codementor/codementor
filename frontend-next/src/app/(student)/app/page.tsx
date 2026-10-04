"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { DataState } from "@/components/ui/DataState";
import { CardGridSkeleton } from "@/components/ui/Skeletons";
import { QuickAccessGrid } from "@/components/student/quick-access/QuickAccessGrid";
import { Reveal } from "@/components/ui/motion";
import { getUser } from "@/lib/auth";
import { shape, layout } from "@/theme/tokens";
import { useAvailableExamsQuery, useDashboardQuery } from "@/lib/queries/student";
import { useRoadmapsQuery } from "@/lib/queries/roadmaps";

/**
 * Home — where a student lands after signing in.
 *
 * Six illustrated tiles and nothing else. The temptation is to put a couple of
 * statistics here too, and that is exactly what went wrong when this lived on
 * top of the dashboard: two jobs on one page, each making the other harder to
 * read. The numbers are one click away on the dashboard, which is now free to
 * be only that.
 *
 * Each tile carries a live line, so the page still answers "what should I do
 * now?" — "Profiling Test-1 is live now" is worth more than six labels.
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

  const stats = data?.dashboard?.stats;
  const isNewUser = !!stats && stats.totalSubs === 0;

  return (
    <Box>
      {/* Same tonal band the dashboard used to open with. It belongs here now:
          a greeting belongs at the door, not one room further in. */}
      <Box
        sx={{
          mb: layout.sectionGap,
          p: { xs: 2.5, sm: 3.5 },
          borderRadius: `${shape.extraLarge}px`,
          color: "onPrimaryContainer",
          background:
            "linear-gradient(135deg, var(--mui-palette-primaryContainer), color-mix(in srgb, var(--mui-palette-onPrimaryContainer) 12%, var(--mui-palette-primaryContainer)))",
          boxShadow: "0 8px 24px color-mix(in srgb, var(--mui-palette-primaryContainer) 45%, transparent)",
        }}
      >
        <Typography variant="h3" component="h1" fontWeight={700} sx={{ letterSpacing: "-0.01em" }}>
          {name ? `${greeting}, ${name}!` : `${greeting}!`}
        </Typography>
        <Typography variant="body1" sx={{ mt: 0.75, opacity: 0.85, maxWidth: 560 }}>
          {isNewUser
            ? "Everything starts from here. Pick where you want to begin."
            : "Where would you like to pick up?"}
        </Typography>
      </Box>

      <DataState
        loading={isLoading}
        fetching={isFetching && !isLoading}
        error={isError ? error : undefined}
        onRetry={refetch}
        skeleton={<CardGridSkeleton count={6} height={128} minWidth={280} />}
      >
        <Reveal>
          <QuickAccessGrid
            stats={stats}
            courses={data?.courses ?? []}
            assignments={data?.assignments ?? []}
            exams={exams ?? []}
            className={className}
            activeRoadmap={activeRoadmap}
          />
        </Reveal>
      </DataState>
    </Box>
  );
}
