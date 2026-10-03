"use client";

import * as React from "react";
import { notFound } from "next/navigation";
import Box from "@mui/material/Box";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  ChartCard, ChartRow, FilterBar, InsightTile, KpiRow, KpiTile, Leaderboard, StackedBars, TrendLines,
  type GroupOption, type Period,
} from "@/components/analytics";
import {
  CheckCircleOutlineIcon, GroupsOutlinedIcon, LocalFireDepartmentIcon, TipsAndUpdatesOutlinedIcon,
  TrackChangesOutlinedIcon, WarningAmberIcon,
} from "@/components/ui/icons";

/** Dev-only gallery of the shared analytics kit. 404s in production builds. */
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const groups: GroupOption[] = [
  { id: 1, label: "CSE-A" },
  { id: 2, label: "CSE-B" },
  { id: 3, label: "Mixed batch (CSE+ECE)" },
];

export default function AnalyticsKitGallery() {
  if (process.env.NODE_ENV === "production") notFound();
  const [period, setPeriod] = React.useState<Period>("7d");
  const [sel, setSel] = React.useState<GroupOption[]>([]);

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", p: { xs: 2, md: 4 } }}>
      <PageHeader title="Analytics kit" subtitle="KPI tiles → where-stuck chart → trends → leaderboards → drill-down" />
      <FilterBar period={period} onPeriodChange={setPeriod} groups={groups} selectedGroups={sel} onGroupsChange={setSel} />

      <KpiRow>
        <KpiTile icon={<GroupsOutlinedIcon />} label="Active users" value={86} total={120} delta={12} series={[4, 6, 5, 9, 12, 10, 14]} />
        <KpiTile icon={<WarningAmberIcon />} label="Suspicious" value={3} total={120} accent="error" delta={50} invertDelta series={[0, 1, 0, 1, 1, 2, 3]} />
        <KpiTile icon={<CheckCircleOutlineIcon />} label="Completed" value={41} total={120} accent="success" series={[2, 5, 9, 14, 22, 33, 41]} />
        <KpiTile icon={<LocalFireDepartmentIcon />} label="Streak" value={12} suffix=" days" accent="warning" />
        <KpiTile icon={<GroupsOutlinedIcon />} label="Loading" value={0} loading />
      </KpiRow>

      <KpiRow min={260}>
        <InsightTile icon={<TrackChangesOutlinedIcon />} label="Strongest" value="Arrays & Hashing" detail="91% accuracy" />
        <InsightTile icon={<TipsAndUpdatesOutlinedIcon />} label="Focus on" value="Dynamic Programming" detail="38% accuracy" accent="warning" />
        <InsightTile icon={<TipsAndUpdatesOutlinedIcon />} label="Focus on" value={null} accent="warning" />
      </KpiRow>

      <ChartRow cols={2}>
        <ChartCard title="Unit-wise completion" subtitle="Where the class is stuck" height={300}>
          <StackedBars
            rows={[
              { label: "Basics", Solved: 40, Partial: 8, "Not started": 2 },
              { label: "Loops", Solved: 32, Partial: 12, "Not started": 6 },
              { label: "Arrays", Solved: 21, Partial: 15, "Not started": 14 },
              { label: "Recursion", Solved: 9, Partial: 11, "Not started": 30 },
            ]}
          />
        </ChartCard>
        <ChartCard title="Submissions vs solved" subtitle="Last 7 days" height={300}>
          <TrendLines
            height={300}
            series={[
              { id: "Submissions", data: days.map((x, i) => ({ x, y: [20, 34, 28, 51, 47, 12, 9][i] })) },
              { id: "Solved", data: days.map((x, i) => ({ x, y: [9, 18, 15, 30, 26, 6, 5][i] })) },
            ]}
          />
        </ChartCard>
      </ChartRow>

      <ChartRow cols={3}>
        <Leaderboard
          title="Most active users"
          subtitle="Minutes on platform"
          unit=" min"
          rows={[
            { id: 1, label: "Asha R", hint: "21CS001", value: 310 },
            { id: 2, label: "Kiran P", hint: "21CS014", value: 244 },
            { id: 3, label: "Meena S", hint: "21CS022", value: 180 },
            { id: 4, label: "Ravi T", hint: "21CS030", value: 35 },
          ]}
        />
        <Leaderboard title="Most active groups" rows={[]} emptyDescription="Groups appear once students have activity." />
        <ChartCard title="Loading state" loading>
          <span />
        </ChartCard>
      </ChartRow>
    </Box>
  );
}
