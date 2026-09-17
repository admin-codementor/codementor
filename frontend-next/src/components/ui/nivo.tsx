"use client";

import { useTheme } from "@mui/material/styles";
import { darkScheme, lightScheme } from "@/theme/tokens";

/**
 * Nivo chart theme derived from our Material-3 tokens (resolved hex per mode, since
 * Nivo needs concrete colors, not CSS vars). Keeps charts on-palette in light/dark.
 */
export function useNivoTheme() {
  const t = useTheme();
  const s = t.palette.mode === "dark" ? darkScheme : lightScheme;
  return {
    background: "transparent",
    text: { fill: s.onSurfaceVariant, fontSize: 12, fontFamily: t.typography.fontFamily as string },
    axis: {
      domain: { line: { stroke: s.outlineVariant, strokeWidth: 1 } },
      ticks: { line: { stroke: s.outlineVariant, strokeWidth: 1 }, text: { fill: s.onSurfaceVariant, fontSize: 11 } },
      legend: { text: { fill: s.onSurface, fontSize: 12, fontWeight: 600 } },
    },
    grid: { line: { stroke: s.outlineVariant, strokeDasharray: "3 4", strokeOpacity: 0.55 } },
    legends: { text: { fill: s.onSurfaceVariant, fontSize: 12 } },
    tooltip: {
      container: {
        background: s.surfaceContainerHigh,
        color: s.onSurface,
        fontSize: 12,
        borderRadius: 10,
        // M3 scrim is always black regardless of scheme, so this is already
        // on-token — spelled via the resolved value since Nivo needs a concrete color.
        boxShadow: `0 6px 20px color-mix(in srgb, ${s.scrim} 20%, transparent)`,
        padding: "8px 12px",
      },
    },
  };
}

/** Ordered categorical series palette (M3 roles). */
export function useChartColors() {
  const t = useTheme();
  const s = t.palette.mode === "dark" ? darkScheme : lightScheme;
  return [s.primary, s.tertiary, s.success, s.warning, s.error, s.secondary, s.ai];
}
