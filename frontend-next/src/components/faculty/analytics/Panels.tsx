"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import { ResponsiveBar } from "@nivo/bar";
import { ResponsiveLine } from "@nivo/line";
import { ResponsiveHeatMap } from "@nivo/heatmap";
import { ResponsiveScatterPlot } from "@nivo/scatterplot";
import { ResponsiveRadar } from "@nivo/radar";
import { ResponsiveFunnel } from "@nivo/funnel";
import { useNivoTheme, useChartColors } from "@/components/ui/nivo";
import { TrendingUpIcon, TrendingDownIcon } from "@/components/ui/icons";

/** Compact KPI with a period-over-period delta and an inline sparkline. */
export function KpiTile({
  label, value, delta, series, suffix, help,
}: {
  label: string;
  value: number | string;
  delta?: number | null;
  series?: number[];
  suffix?: string;
  help?: string;
}) {
  const colors = useChartColors();
  const up = (delta ?? 0) > 0;
  const flat = delta === 0 || delta == null;

  return (
    <Box sx={{ p: 2, border: "1px solid", borderColor: "outlineVariant", borderRadius: 3, minWidth: 0 }}>
      <Tooltip title={help ?? ""}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", textTransform: "uppercase", letterSpacing: 0.4 }}>
          {label}
        </Typography>
      </Tooltip>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mt: 0.5 }}>
        <Typography variant="h5" fontWeight={600}>{value}{suffix}</Typography>
        {!flat && (
          <Stack direction="row" alignItems="center" spacing={0.25} sx={{ color: up ? "success.main" : "error.main" }}>
            {up ? <TrendingUpIcon sx={{ fontSize: 15 }} /> : <TrendingDownIcon sx={{ fontSize: 15 }} />}
            <Typography variant="caption" fontWeight={600}>{Math.abs(delta as number)}%</Typography>
          </Stack>
        )}
      </Stack>
      {series && series.length > 1 && (
        <Box sx={{ height: 34, mt: 0.5, mx: -0.5 }}>
          <ResponsiveLine
            data={[{ id: label, data: series.map((y, i) => ({ x: i, y })) }]}
            margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
            colors={[colors[0]]}
            enablePoints={false}
            enableGridX={false}
            enableGridY={false}
            axisLeft={null}
            axisBottom={null}
            isInteractive={false}
            curve="monotoneX"
            lineWidth={2}
          />
        </Box>
      )}
    </Box>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** When work actually happens — the rhythm a totals chart can't show. */
export function ActivityHeatmap({ grid }: { grid: number[][] }) {
  const theme = useNivoTheme();
  const data = React.useMemo(
    () => grid.map((row, d) => ({
      id: DAYS[d],
      data: row.map((v, h) => ({ x: `${String(h).padStart(2, "0")}`, y: v })),
    })).reverse(),
    [grid],
  );
  const max = Math.max(1, ...grid.flat());

  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveHeatMap
        data={data}
        margin={{ top: 24, right: 16, bottom: 28, left: 44 }}
        valueFormat=">-.0f"
        theme={theme}
        colors={{ type: "sequential", scheme: "blues", minValue: 0, maxValue: max }}
        emptyColor="transparent"
        borderRadius={2}
        borderWidth={1}
        borderColor="rgba(0,0,0,0.04)"
        axisTop={{ tickSize: 0, tickPadding: 6, tickRotation: 0, legend: "", truncateTickAt: 0 }}
        axisLeft={{ tickSize: 0, tickPadding: 6 }}
        labelTextColor="rgba(0,0,0,0.75)"
        hoverTarget="cell"
        animate={false}
      />
    </Box>
  );
}

/** Submissions and accepted over time. */
export function TrendChart({ daily }: { daily: { date: string; subs: number; ac: number }[] }) {
  const theme = useNivoTheme();
  const colors = useChartColors();
  const data = [
    { id: "Submissions", data: daily.map((d) => ({ x: d.date, y: d.subs })) },
    { id: "Accepted", data: daily.map((d) => ({ x: d.date, y: d.ac })) },
  ];
  return (
    <Box sx={{ height: 280 }}>
      <ResponsiveLine
        data={data}
        margin={{ top: 16, right: 16, bottom: 60, left: 44 }}
        xScale={{ type: "point" }}
        yScale={{ type: "linear", min: 0, stacked: false }}
        colors={[colors[0], colors[2]]}
        theme={theme}
        curve="monotoneX"
        enablePoints={false}
        enableSlices="x"
        axisBottom={{
          tickSize: 0, tickPadding: 8, tickRotation: -45,
          // Thin the labels so a long window stays readable.
          format: (v: string) => (daily.length <= 14 || daily.findIndex((d) => d.date === v) % Math.ceil(daily.length / 10) === 0 ? v.slice(5) : ""),
        }}
        axisLeft={{ tickSize: 0, tickPadding: 8 }}
        legends={[{
          anchor: "bottom", direction: "row", translateY: 56, itemWidth: 110, itemHeight: 18,
          symbolSize: 10, symbolShape: "circle",
        }]}
      />
    </Box>
  );
}

/** One dot per student: effort against success, with quadrant guides. */
export function StudentScatter({
  points, onPick,
}: {
  points: { id: string; name: string; x: number; y: number; solved: number }[];
  onPick?: (id: string) => void;
}) {
  const theme = useNivoTheme();
  const colors = useChartColors();
  const data = [{ id: "students", data: points.map((p) => ({ ...p })) }];

  return (
    <Box sx={{ height: 320 }}>
      <ResponsiveScatterPlot
        data={data}
        margin={{ top: 16, right: 20, bottom: 56, left: 56 }}
        xScale={{ type: "linear", min: 0, max: "auto" }}
        yScale={{ type: "linear", min: 0, max: 100 }}
        theme={theme}
        colors={[colors[0]]}
        nodeSize={10}
        blendMode="normal"
        axisBottom={{ tickSize: 0, tickPadding: 8, legend: "Submissions (effort)", legendPosition: "middle", legendOffset: 42 }}
        axisLeft={{ tickSize: 0, tickPadding: 8, legend: "Acceptance rate %", legendPosition: "middle", legendOffset: -44 }}
        onClick={(node) => onPick?.((node.data as unknown as { id: string }).id)}
        tooltip={({ node }) => {
          const d = node.data as unknown as { name: string; x: number; y: number; solved: number };
          return (
            <Box sx={{ bgcolor: "surfaceContainerHigh", color: "onSurface", p: 1, borderRadius: 2, fontSize: 12, boxShadow: 3 }}>
              <strong>{d.name}</strong><br />
              {d.x} submissions · {d.y}% accepted · {d.solved} solved
            </Box>
          );
        }}
      />
    </Box>
  );
}

/** Distribution of a per-student measure — what an average conceals. */
export function DistributionChart({
  histogram, label,
}: {
  histogram: { bucket: string; count: number }[];
  label: string;
}) {
  const theme = useNivoTheme();
  const colors = useChartColors();
  return (
    <Box sx={{ height: 240 }}>
      <ResponsiveBar
        data={histogram}
        keys={["count"]}
        indexBy="bucket"
        margin={{ top: 16, right: 16, bottom: 52, left: 48 }}
        padding={0.25}
        borderRadius={4}
        colors={[colors[1]]}
        theme={theme}
        enableLabel={false}
        axisBottom={{ tickSize: 0, tickPadding: 8, legend: label, legendPosition: "middle", legendOffset: 40 }}
        axisLeft={{ tickSize: 0, tickPadding: 8, legend: "Students", legendPosition: "middle", legendOffset: -38 }}
      />
    </Box>
  );
}

/** Five-number summary rendered as a compact box-plot row per cohort. */
export function BoxPlotRow({
  rows,
}: {
  rows: { label: string; box: { min: number; q1: number; median: number; q3: number; max: number; mean: number; n: number } | null }[];
}) {
  const colors = useChartColors();
  const usable = rows.filter((r) => r.box);
  const globalMax = Math.max(1, ...usable.map((r) => r.box!.max));

  return (
    <Stack spacing={1.25}>
      {usable.length === 0 && <Typography variant="body2" color="text.secondary">Not enough data.</Typography>}
      {usable.map(({ label, box }) => {
        const b = box!;
        const pct = (v: number) => `${(v / globalMax) * 100}%`;
        return (
          <Box key={label}>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
              <Typography variant="caption" fontWeight={600}>{label}</Typography>
              <Typography variant="caption" color="text.secondary">
                median {b.median} · mean {b.mean} · n={b.n}
              </Typography>
            </Stack>
            <Tooltip title={`min ${b.min} · Q1 ${b.q1} · median ${b.median} · Q3 ${b.q3} · max ${b.max}`}>
              <Box sx={{ position: "relative", height: 18, bgcolor: "surfaceContainerHigh", borderRadius: 1 }}>
                {/* whiskers */}
                <Box sx={{ position: "absolute", top: 8, left: pct(b.min), width: `calc(${pct(b.max)} - ${pct(b.min)})`, height: 2, bgcolor: "outlineVariant" }} />
                {/* interquartile box */}
                <Box sx={{ position: "absolute", top: 3, left: pct(b.q1), width: `calc(${pct(b.q3)} - ${pct(b.q1)})`, height: 12, bgcolor: colors[0], opacity: 0.35, borderRadius: 0.5 }} />
                {/* median */}
                <Box sx={{ position: "absolute", top: 1, left: pct(b.median), width: 2, height: 16, bgcolor: colors[0] }} />
              </Box>
            </Tooltip>
          </Box>
        );
      })}
    </Stack>
  );
}

/** Topic mastery across a cohort. */
export function TopicRadar({ topics }: { topics: { topic: string; accuracy: number }[] }) {
  const theme = useNivoTheme();
  const colors = useChartColors();
  if (topics.length < 3) {
    return <Typography variant="body2" color="text.secondary">Needs at least three topics with activity.</Typography>;
  }
  return (
    <Box sx={{ height: 300 }}>
      <ResponsiveRadar
        data={topics.map((t) => ({ topic: t.topic, accuracy: t.accuracy }))}
        keys={["accuracy"]}
        indexBy="topic"
        maxValue={100}
        margin={{ top: 40, right: 60, bottom: 30, left: 60 }}
        theme={theme}
        colors={[colors[2]]}
        fillOpacity={0.2}
        borderWidth={2}
        gridLabelOffset={12}
        dotSize={6}
      />
    </Box>
  );
}

/** Nested stages: in scope → attempted → solved. */
export function FunnelChart({ stages }: { stages: { stage: string; value: number }[] }) {
  const theme = useNivoTheme();
  const colors = useChartColors();
  return (
    <Box sx={{ height: 260 }}>
      <ResponsiveFunnel
        data={stages.map((s) => ({ id: s.stage, value: s.value, label: `${s.stage} (${s.value})` }))}
        margin={{ top: 16, right: 24, bottom: 16, left: 24 }}
        theme={theme}
        colors={[colors[0], colors[1], colors[2]]}
        borderWidth={0}
        labelColor={{ from: "color", modifiers: [["darker", 3]] }}
        beforeSeparatorLength={0}
        afterSeparatorLength={0}
        currentPartSizeExtension={8}
      />
    </Box>
  );
}

/** Per-test-case failure hotspots for one problem. */
export function TestCaseHeatmap({
  rows,
}: {
  rows: { testIndex: number; isPublic: boolean; attempts: number; failures: number; failRate: number }[];
}) {
  if (rows.length === 0) return <Typography variant="body2" color="text.secondary">No graded submissions yet.</Typography>;
  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
      {rows.map((r) => (
        <Tooltip key={r.testIndex} title={`Test ${r.testIndex}${r.isPublic ? " (sample)" : ""} — ${r.failures}/${r.attempts} failed`}>
          <Box
            sx={{
              width: 46, height: 46, borderRadius: 2, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", border: "1px solid", borderColor: "outlineVariant",
              // Red intensity tracks the fail rate; a wall of red on one index is
              // the edge case the class is missing.
              bgcolor: r.failRate === 0 ? "successContainer" : `rgba(211, 47, 47, ${0.12 + (r.failRate / 100) * 0.66})`,
              color: r.failRate > 55 ? "#fff" : "text.primary",
            }}
          >
            <Typography variant="caption" fontWeight={700} sx={{ lineHeight: 1 }}>{r.testIndex}</Typography>
            <Typography variant="caption" sx={{ fontSize: 10, lineHeight: 1.2 }}>{r.failRate}%</Typography>
          </Box>
        </Tooltip>
      ))}
    </Stack>
  );
}

/** Difficulty index against discrimination index for MCQ items. */
export function ItemAnalysisScatter({
  items,
}: {
  items: { position: number; question_text: string; difficultyIndex: number; discriminationIndex: number; flag: string | null }[];
}) {
  const theme = useNivoTheme();
  const colors = useChartColors();
  const good = items.filter((i) => !i.flag);
  const bad = items.filter((i) => i.flag);
  const data = [
    { id: "Healthy", data: good.map((i) => ({ x: i.difficultyIndex, y: i.discriminationIndex, item: i })) },
    { id: "Needs review", data: bad.map((i) => ({ x: i.difficultyIndex, y: i.discriminationIndex, item: i })) },
  ].filter((s) => s.data.length);

  return (
    <Box sx={{ height: 320 }}>
      <ResponsiveScatterPlot
        data={data}
        margin={{ top: 16, right: 24, bottom: 56, left: 60 }}
        xScale={{ type: "linear", min: 0, max: 1 }}
        yScale={{ type: "linear", min: -0.5, max: 1 }}
        theme={theme}
        colors={[colors[2], colors[4]]}
        nodeSize={11}
        axisBottom={{ tickSize: 0, tickPadding: 8, legend: "Difficulty (share answering correctly)", legendPosition: "middle", legendOffset: 42 }}
        axisLeft={{ tickSize: 0, tickPadding: 8, legend: "Discrimination", legendPosition: "middle", legendOffset: -46 }}
        tooltip={({ node }) => {
          const d = (node.data as unknown as { item: { position: number; question_text: string; flag: string | null } }).item;
          return (
            <Box sx={{ bgcolor: "surfaceContainerHigh", color: "onSurface", p: 1, borderRadius: 2, fontSize: 12, maxWidth: 280, boxShadow: 3 }}>
              <strong>Q{d.position}</strong> — {d.question_text.slice(0, 90)}
              {d.flag && <><br /><em>{d.flag}</em></>}
            </Box>
          );
        }}
        legends={[{
          anchor: "bottom", direction: "row", translateY: 50, itemWidth: 120, itemHeight: 16,
          symbolSize: 10, symbolShape: "circle",
        }]}
      />
    </Box>
  );
}

/** Horizontal ranked bars — used for verdicts and language mix. */
export function RankedBars({
  rows, valueKey, indexKey, colorIndex = 0,
}: {
  rows: Record<string, string | number>[];
  valueKey: string;
  indexKey: string;
  colorIndex?: number;
}) {
  const theme = useNivoTheme();
  const colors = useChartColors();
  if (rows.length === 0) return <Typography variant="body2" color="text.secondary">No data yet.</Typography>;
  return (
    <Box sx={{ height: Math.max(160, rows.length * 34) }}>
      <ResponsiveBar
        data={rows}
        keys={[valueKey]}
        indexBy={indexKey}
        layout="horizontal"
        margin={{ top: 8, right: 24, bottom: 28, left: 130 }}
        padding={0.28}
        borderRadius={4}
        colors={[colors[colorIndex]]}
        theme={theme}
        enableLabel
        labelSkipWidth={22}
        axisBottom={{ tickSize: 0, tickPadding: 6 }}
        axisLeft={{ tickSize: 0, tickPadding: 8 }}
      />
    </Box>
  );
}

/** Explainable risk chips — never a bare score. */
export function RiskChips({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return <Chip size="small" label="On track" sx={{ height: 20, fontSize: 10, bgcolor: "successContainer", color: "onSuccessContainer" }} />;
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
      {reasons.map((r) => (
        <Chip key={r} size="small" label={r} sx={{ height: 20, fontSize: 10, bgcolor: "warningContainer", color: "onWarningContainer" }} />
      ))}
    </Stack>
  );
}
