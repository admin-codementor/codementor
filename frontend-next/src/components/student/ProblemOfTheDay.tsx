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
import { useDailyChallengeQuery } from "@/lib/queries/student";
import { radius } from "@/theme/tokens";

/** Banner card: today's problem with a direct "Solve now" action. */
export function ProblemOfTheDay() {
  const { data: problem, isLoading } = useDailyChallengeQuery();

  if (isLoading) return <Skeleton variant="rounded" height={104} sx={{ borderRadius: radius.lg }} />;
  // Nothing to show when the catalogue is empty, and a failure here must not
  // take the dashboard down — the rest of the page is unaffected.
  if (!problem) return null;
  const solved = problem.solved;

  return (
    <Box
      sx={{
        p: 2.5,
        borderRadius: radius.lg,
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
