"use client";

import * as React from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ArrowForwardIcon, CheckCircleIcon, TipsAndUpdatesOutlinedIcon } from "@/components/ui/icons";
import { DifficultyChip } from "@/components/ui/DifficultyChip";
import { useProblemsQuery, useSolvedProblemsQuery } from "@/lib/queries/problems";
import { pickProblemOfTheDay } from "@/lib/problemOfTheDay";
import { shape } from "@/theme/tokens";

/** Banner card: today's problem with a direct "Solve now" action. */
export function ProblemOfTheDay() {
  const problemsQuery = useProblemsQuery({ page: 1 });
  const solvedQuery = useSolvedProblemsQuery();

  const problem = React.useMemo(
    () => pickProblemOfTheDay(problemsQuery.data?.problems ?? []),
    [problemsQuery.data],
  );
  const solved = problem ? (solvedQuery.data ?? []).map(String).includes(String(problem.id)) : false;

  if (problemsQuery.isLoading) return <Skeleton variant="rounded" height={104} sx={{ borderRadius: `${shape.large}px` }} />;
  if (!problem) return null;

  return (
    <Box
      sx={{
        p: 2.5,
        borderRadius: `${shape.large}px`,
        bgcolor: "tertiaryContainer",
        color: "onTertiaryContainer",
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        alignItems: { xs: "flex-start", sm: "center" },
        gap: 2,
      }}
    >
      <TipsAndUpdatesOutlinedIcon fontSize="large" />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="overline" sx={{ lineHeight: 1.4, opacity: 0.85 }}>Problem of the day</Typography>
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle1" fontWeight={600}>{problem.title}</Typography>
          <DifficultyChip difficulty={problem.difficulty} />
        </Stack>
      </Box>
      {solved ? (
        <Stack direction="row" spacing={0.75} alignItems="center">
          <CheckCircleIcon fontSize="small" />
          <Typography variant="body2" fontWeight={600}>Solved</Typography>
        </Stack>
      ) : (
        <Button component={NextLink} href={`/app/problems/${problem.id}`} variant="contained" endIcon={<ArrowForwardIcon />}>
          Solve now
        </Button>
      )}
    </Box>
  );
}
