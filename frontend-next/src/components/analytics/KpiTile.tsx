"use client";

import * as React from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { Sparkline } from "@/components/ui/Sparkline";
import { interactiveSurfaceSx } from "@/components/ui/interactive";
import { TrendingDownIcon, TrendingUpIcon } from "@/components/ui/icons";
import { useChartColors } from "@/components/ui/nivo";
import { shape } from "@/theme/tokens";

export type Accent = "primary" | "secondary" | "tertiary" | "success" | "warning" | "error";

export const ACCENT_CONTAINER: Record<Accent, { bg: string; fg: string }> = {
  primary: { bg: "primaryContainer", fg: "onPrimaryContainer" },
  secondary: { bg: "secondaryContainer", fg: "onSecondaryContainer" },
  tertiary: { bg: "tertiaryContainer", fg: "onTertiaryContainer" },
  success: { bg: "successContainer", fg: "onSuccessContainer" },
  warning: { bg: "warningContainer", fg: "onWarningContainer" },
  error: { bg: "errorContainer", fg: "onErrorContainer" },
};

/**
 * Headline-number tile — the first layer of every analytics screen.
 * Value, optional `/ total` (current/total), optional period-over-period delta
 * and an inline sparkline. Uses the dependency-free `Sparkline`, so a page
 * with only KPI tiles never loads the chart engine. `invertDelta` flips the
 * good/bad colouring for "lower is better" metrics (suspicious activity,
 * not-started users).
 */
export const KpiTile = React.memo(function KpiTile({
  icon,
  label,
  value,
  total,
  suffix,
  delta,
  invertDelta = false,
  series,
  help,
  accent = "primary",
  loading = false,
  href,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  total?: number | string;
  suffix?: string;
  delta?: number | null;
  invertDelta?: boolean;
  series?: number[];
  help?: string;
  accent?: Accent;
  loading?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const colors = useChartColors();
  const c = ACCENT_CONTAINER[accent];
  const flat = delta === 0 || delta == null;
  const up = (delta ?? 0) > 0;
  const good = invertDelta ? !up : up;

  const body = (
    <Box sx={{ p: 2.5, height: "100%" }}>
      <Stack direction="row" spacing={2} alignItems="center">
        <Box
          aria-hidden
          sx={{
            width: 48,
            height: 48,
            borderRadius: `${shape.large}px`,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            color: c.fg,
            background: `linear-gradient(135deg, var(--mui-palette-${c.bg}), color-mix(in srgb, var(--mui-palette-${c.fg}) 16%, var(--mui-palette-${c.bg})))`,
            boxShadow: `0 4px 12px color-mix(in srgb, var(--mui-palette-${c.bg}) 55%, transparent)`,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Tooltip title={help ?? ""} placement="top-start">
            <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4 }}>
              {label}
            </Typography>
          </Tooltip>
          {loading ? (
            <Skeleton width={72} height={32} />
          ) : (
            <Stack direction="row" alignItems="baseline" spacing={1} flexWrap="wrap" useFlexGap>
              <Typography variant="h5" fontWeight={600} sx={{ lineHeight: 1.2 }}>
                {value}
                {suffix}
                {total != null && (
                  <Typography component="span" variant="body1" color="text.secondary" fontWeight={500}>
                    {" "}
                    / {total}
                  </Typography>
                )}
              </Typography>
              {!flat && (
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={0.25}
                  sx={{ color: good ? "success.main" : "error.main" }}
                  aria-label={`${up ? "Up" : "Down"} ${Math.abs(delta as number)} percent`}
                >
                  {up ? <TrendingUpIcon sx={{ fontSize: 15 }} /> : <TrendingDownIcon sx={{ fontSize: 15 }} />}
                  <Typography variant="caption" fontWeight={600}>
                    {Math.abs(delta as number)}%
                  </Typography>
                </Stack>
              )}
            </Stack>
          )}
        </Box>
      </Stack>
      {!loading && series && series.length > 1 && (
        <Box sx={{ mt: 1 }}>
          <Sparkline data={series} width={200} height={28} color={colors[0]} />
        </Box>
      )}
    </Box>
  );

  const interactive = Boolean(href || onClick);
  return (
    <Card
      variant="outlined"
      sx={{ borderColor: "outlineVariant", height: "100%", ...(interactive ? interactiveSurfaceSx : {}) }}
    >
      {interactive ? (
        <CardActionArea
          {...(href ? { component: NextLink, href } : {})}
          onClick={onClick}
          aria-label={label}
          sx={{ height: "100%", borderRadius: "inherit" }}
        >
          {body}
        </CardActionArea>
      ) : (
        body
      )}
    </Card>
  );
});
