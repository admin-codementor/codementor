"use client";

import * as React from "react";

/**
 * Minimal dependency-free line+area sparkline — replaces the single
 * `@mui/x-charts` `SparkLineChart` usage in the IDE results panel so the app
 * doesn't ship two charting engines (Nivo is used everywhere else) for one
 * 56×24px chart.
 */
export function Sparkline({
  data,
  width = 56,
  height = 24,
  color = "currentColor",
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });

  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden focusable="false">
      <path d={areaPath} fill={color} fillOpacity={0.18} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
