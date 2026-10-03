"use client";

import * as React from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import { AssignmentOutlinedIcon, EmojiEventsOutlinedIcon, TimerOutlinedIcon, TipsAndUpdatesOutlinedIcon, TrackChangesOutlinedIcon } from "@/components/ui/icons";
import { KpiTile } from "@/components/analytics/KpiTile";
import { InsightTile } from "@/components/analytics/InsightTile";
import { EmptyState } from "@/components/ui/States";
import { averageExamPct, useAvailableExamsQuery, useSkillsQuery } from "@/lib/queries/student";

/**
 * "How am I doing?" block: exam average and count, plus the topic you are
 * strongest at and the one to focus on. Topics come from the same scoring
 * faculty see (3+ attempts before a topic is called), so a single unlucky
 * submission never labels a topic as a weakness.
 */
export function ExamPerformance() {
  const examsQuery = useAvailableExamsQuery();
  const skillsQuery = useSkillsQuery();

  const exams = examsQuery.data ?? [];
  const taken = exams.filter((e) => e.attempted);
  const avg = averageExamPct(exams);
  const strongest = skillsQuery.data?.strengths[0];
  const focus = skillsQuery.data?.weaknesses[0];
  // The same topic can top both lists when only one topic has enough attempts;
  // calling it both "strongest" and "focus on" would be contradictory.
  const focusDistinct = focus && focus.topic !== strongest?.topic ? focus : undefined;

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>Performance</Typography>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(4, 1fr)" } }}>
        <KpiTile
          icon={<EmojiEventsOutlinedIcon />}
          label="Exam average"
          value={avg ?? "—"}
          suffix={avg != null ? "%" : undefined}
          accent="primary"
          loading={examsQuery.isLoading}
          help="Average of score ÷ total across your completed exams"
          href="/app/exams"
        />
        <KpiTile
          icon={<TimerOutlinedIcon />}
          label="Exams taken"
          value={taken.length}
          total={exams.length}
          accent="secondary"
          loading={examsQuery.isLoading}
          href="/app/exams"
        />
        <InsightTile
          icon={<TrackChangesOutlinedIcon />}
          label="Strongest topic"
          value={strongest?.topic}
          detail={strongest ? `${strongest.acRate}% success · ${strongest.attempts} attempts` : "Solve a few problems on a topic to see it here"}
          accent="success"
        />
        <InsightTile
          icon={<TipsAndUpdatesOutlinedIcon />}
          label="Focus on"
          value={focusDistinct?.topic}
          detail={focusDistinct ? `${focusDistinct.acRate}% success · ${focusDistinct.attempts} attempts` : "Shows once you have a weaker topic to work on"}
          accent="warning"
        />
      </Box>
      {!examsQuery.isLoading && exams.length === 0 && (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", mt: 2 }}>
          <EmptyState
            icon={<AssignmentOutlinedIcon />}
            title="No exams yet"
            description="When your faculty publishes an exam it shows up here, and your results build this summary."
            action={<Button component={NextLink} href="/app/exams" variant="outlined">Go to Exams</Button>}
          />
        </Card>
      )}
    </Box>
  );
}
