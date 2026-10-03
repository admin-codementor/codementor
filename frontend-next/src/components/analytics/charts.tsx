"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import { ResponsiveBar } from "@nivo/bar";
import { ResponsiveLine } from "@nivo/line";
import { useTheme } from "@mui/material/styles";
import { useChartColors, useNivoTheme } from "@/components/ui/nivo";
import { darkScheme, lightScheme } from "@/theme/tokens";

export interface StackedRow {
  /** Category label (e.g. a syllabus unit). */
  label: string;
  [segment: string]: string | number;
}

/**
 * Where-is-the-class-stuck chart: one stacked bar per category split into
 * segments (default Solved / Partial / Not started). Segment colours follow
 * meaning, not rank: green = done, amber = in progress, grey = untouched.
 * Put inside a ChartCard (it fills the card's height).
 */
export function StackedBars({
  rows,
  segments = ["Solved", "Partial", "Not started"],
  layout = "vertical",
  height = 280,
}: {
  rows: StackedRow[];
  segments?: string[];
  layout?: "vertical" | "horizontal";
  height?: number;
}) {
  const theme = useNivoTheme();
  const s = useTheme().palette.mode === "dark" ? darkScheme : lightScheme;
  const palette = [s.success, s.warning, s.surfaceContainerHighest];
  const colors = segments.map((_, i) => palette[i] ?? s.outline);
  return (
    <Box sx={{ height }}>
      <ResponsiveBar
        data={rows}
        keys={segments}
        indexBy="label"
        layout={layout}
        margin={{ top: 8, right: 16, bottom: layout === "vertical" ? 76 : 28, left: layout === "vertical" ? 40 : 110 }}
        padding={0.3}
        borderRadius={3}
        colors={colors}
        theme={theme}
        enableLabel={false}
        axisBottom={{ tickSize: 0, tickPadding: 8, tickRotation: layout === "vertical" ? -30 : 0 }}
        axisLeft={{ tickSize: 0, tickPadding: 8 }}
        legends={[
          { dataFrom: "keys", anchor: "bottom", direction: "row", translateY: layout === "vertical" ? 76 : 28, itemWidth: 90, itemHeight: 16, symbolSize: 10, symbolShape: "circle" },
        ]}
        animate={false}
      />
    </Box>
  );
}

export interface TrendSeries {
  id: string;
  data: { x: string; y: number }[];
}

/** Compact multi-series trend line (direction of travel over the last N days). */
export function TrendLines({
  series,
  height = 220,
  colorOffset = 0,
}: {
  series: TrendSeries[];
  height?: number;
  colorOffset?: number;
}) {
  const theme = useNivoTheme();
  const palette = useChartColors();
  const colors = series.map((_, i) => palette[(i + colorOffset) % palette.length]);
  return (
    <Box sx={{ height }}>
      <ResponsiveLine
        data={series}
        margin={{ top: 12, right: 16, bottom: series.length > 1 ? 56 : 32, left: 40 }}
        xScale={{ type: "point" }}
        yScale={{ type: "linear", min: 0 }}
        colors={colors}
        theme={theme}
        curve="monotoneX"
        enableArea={series.length === 1}
        areaOpacity={0.12}
        enableGridX={false}
        enablePoints={(series[0]?.data.length ?? 0) <= 14}
        pointSize={6}
        enableSlices="x"
        axisBottom={{ tickSize: 0, tickPadding: 8 }}
        axisLeft={{ tickSize: 0, tickPadding: 8 }}
        legends={
          series.length > 1
            ? [{ anchor: "bottom", direction: "row", translateY: 56, itemWidth: 96, itemHeight: 16, symbolSize: 10, symbolShape: "circle" }]
            : []
        }
        animate={false}
      />
    </Box>
  );
}
