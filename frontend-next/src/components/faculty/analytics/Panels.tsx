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
import { ResponsivePie } from "@nivo/pie";
import { useNivoTheme, useChartColors } from "@/components/ui/nivo";
import { TrendingUpIcon, TrendingDownIcon } from "@/components/ui/icons";

/** Compact KPI with a period-over-period delta and an inline sparkline. Pass
 * `hero` for the one lead tile a view wants to draw the eye to first (Von
 * Restorff) — a tonal gradient fill instead of the plain bordered box. */
export function KpiTile({
  label, value, delta, series, suffix, help, hero = false,
}: {
  label: string;
  value: number | string;
  delta?: number | null;
  series?: number[];
  suffix?: string;
  help?: string;
  hero?: boolean;
}) {
  const colors = useChartColors();
  const up = (delta ?? 0) > 0;
  const flat = delta === 0 || delta == null;
  const sparkColor = hero ? "var(--mui-palette-onPrimaryContainer)" : colors[0];

  return (
    <Box
      sx={
        hero
          ? {
              p: 2,
              borderRadius: 3,
              minWidth: 0,
              color: "onPrimaryContainer",
              background: "linear-gradient(135deg, var(--mui-palette-primaryContainer), color-mix(in srgb, var(--mui-palette-onPrimaryContainer) 20%, var(--mui-palette-primaryContainer)))",
              boxShadow: "0 6px 16px color-mix(in srgb, var(--mui-palette-primaryContainer) 55%, transparent)",
            }
          : { p: 2, border: "1px solid", borderColor: "outlineVariant", borderRadius: 3, minWidth: 0 }
      }
    >
      <Tooltip title={help ?? ""}>
        <Typography
          variant="caption"
          sx={{ display: "block", textTransform: "uppercase", letterSpacing: 0.4, color: hero ? "inherit" : "text.secondary", opacity: hero ? 0.85 : 1 }}
        >
          {label}
        </Typography>
      </Tooltip>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mt: 0.5 }}>
        <Typography variant="h5" fontWeight={600}>{value}{suffix}</Typography>
        {!flat && (
          <Stack direction="row" alignItems="center" spacing={0.25} sx={{ color: hero ? "inherit" : up ? "success.main" : "error.main", opacity: hero && !up ? 0.85 : 1 }}>
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
            colors={[sparkColor]}
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
  const data = React.useMemo(() => {
    // Most cohorts are only ever active in a handful of hours (a lab slot, an
    // evening study window). Showing all 24 turns the grid into mostly-empty
    // noise, so trim to the active hours plus one hour of padding either side.
    const active: number[] = [];
    grid.forEach((row) => row.forEach((v, h) => { if (v > 0) active.push(h); }));
    const lo = active.length ? Math.max(0, Math.min(...active) - 1) : 0;
    const hi = active.length ? Math.min(23, Math.max(...active) + 1) : 23;
    const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    return grid.map((row, d) => ({
      id: DAYS[d],
      data: hours.map((h) => ({ x: String(h).padStart(2, "0"), y: row[h] ?? 0 })),
    })).reverse();
  }, [grid]);
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

/** Submissions and accepted over time. Buckets into weeks past ~6 weeks of
 * data — daily counts in the single digits zigzag every day and read as noise
 * once there are months of them; a weekly total shows the actual trend. */
export function TrendChart({ daily }: { daily: { date: string; subs: number; ac: number }[] }) {
  const theme = useNivoTheme();
  const colors = useChartColors();
  const weekly = daily.length > 45;
  const points = React.useMemo(() => {
    if (!weekly) return daily;
    const buckets: { date: string; subs: number; ac: number }[] = [];
    for (let i = 0; i < daily.length; i += 7) {
      const slice = daily.slice(i, i + 7);
      buckets.push({
        date: slice[0].date,
        subs: slice.reduce((s, d) => s + d.subs, 0),
        ac: slice.reduce((s, d) => s + d.ac, 0),
      });
    }
    return buckets;
  }, [daily, weekly]);
  const data = [
    { id: "Submissions", data: points.map((d) => ({ x: d.date, y: d.subs })) },
    { id: "Accepted", data: points.map((d) => ({ x: d.date, y: d.ac })) },
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
        enablePoints={points.length <= 20}
        enableSlices="x"
        axisBottom={{
          tickSize: 0, tickPadding: 8, tickRotation: -45,
          // Thin the labels so a long window stays readable.
          format: (v: string) => (points.length <= 14 || points.findIndex((d) => d.date === v) % Math.ceil(points.length / 10) === 0 ? v.slice(5) : ""),
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

/** Distribution of a per-student measure — what an average conceals. Pass
 * `onBarClick` to drill into which students fall in a given bucket.
 * Nivo's bar click datum only ever carries `indexBy` + `keys` fields (bucket
 * + count) — never other custom fields on the source row like `from` — so
 * the callback only gets those two; look `from` up from `histogram` by
 * `bucket` at the call site if you need it. */
export function DistributionChart({
  histogram, label, onBarClick,
}: {
  histogram: { bucket: string; from: number; count: number }[];
  label: string;
  onBarClick?: (bucket: { bucket: string; count: number }) => void;
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
        onClick={onBarClick ? (d) => onBarClick(d.data as { bucket: string; count: number }) : undefined}
        tooltip={onBarClick ? ({ data }) => (
          <Box sx={{ bgcolor: "surfaceContainerHigh", color: "onSurface", p: 1, borderRadius: 2, fontSize: 12, boxShadow: 3 }}>
            {data.count} student{data.count === 1 ? "" : "s"} · click to list them
          </Box>
        ) : undefined}
      />
    </Box>
  );
}

/** Verdict mix as a donut — replaces a ranked bar list so pass/fail share reads
 * at a glance instead of needing to compare bar lengths. */
export function VerdictDonut({ rows }: { rows: { verdict: string; count: number }[] }) {
  const theme = useNivoTheme();
  const colors = useChartColors();
  if (rows.length === 0) return <Typography variant="body2" color="text.secondary">No data yet.</Typography>;
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
      <Box sx={{ height: 200, width: "100%", maxWidth: 220, flexShrink: 0 }}>
        <ResponsivePie
          data={rows.map((r) => ({ id: r.verdict, label: r.verdict, value: r.count }))}
          margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
          innerRadius={0.6}
          padAngle={1.2}
          cornerRadius={4}
          colors={colors}
          theme={theme}
          borderWidth={0}
          enableArcLinkLabels={false}
          arcLabelsSkipAngle={16}
        />
      </Box>
      <Stack spacing={0.75} sx={{ minWidth: 0, flex: 1 }}>
        {rows.map((r, i) => (
          <Stack key={r.verdict} direction="row" alignItems="center" spacing={1}>
            <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: colors[i % colors.length], flexShrink: 0 }} />
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>{r.verdict}</Typography>
            <Typography variant="body2" fontWeight={600}>{r.count}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 34, textAlign: "right" }}>
              {total > 0 ? Math.round((r.count / total) * 100) : 0}%
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
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
// TopicRadar and FunnelChart moved to their own modules (dynamically imported
// from the analytics page) so @nivo/radar and @nivo/funnel only load when a
// cohort or problem is actually drilled into, not on every analytics page load.

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
              bgcolor: r.failRate === 0
                ? "successContainer"
                : `color-mix(in srgb, var(--mui-palette-error-main) ${Math.round(12 + (r.failRate / 100) * 66)}%, var(--mui-palette-surfaceContainer))`,
              color: r.failRate > 55 ? "common.white" : "text.primary",
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
