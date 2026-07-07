"use client";

import * as React from "react";
import NextLink from "next/link";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import { interactiveSurfaceSx } from "./interactive";

type Accent = "primary" | "secondary" | "tertiary" | "success" | "warning" | "error";

/** Compact metric card: an icon in a tonal container plus a value and label. */
export function StatCard({
  icon,
  label,
  value,
  helper,
  accent = "primary",
  loading = false,
  href,
  onClick,
  selected = false,
  ariaLabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
  accent?: Accent;
  loading?: boolean;
  /** When set, the whole card becomes a link. */
  href?: string;
  /** When set, the whole card becomes a button. */
  onClick?: () => void;
  /** Pressed/active styling for filter-style stat cards. */
  selected?: boolean;
  ariaLabel?: string;
}) {
  const containerKey =
    accent === "tertiary"
      ? { bg: "tertiaryContainer", fg: "onTertiaryContainer" }
      : accent === "success"
        ? { bg: "successContainer", fg: "onSuccessContainer" }
        : accent === "warning"
          ? { bg: "warningContainer", fg: "onWarningContainer" }
          : accent === "error"
            ? { bg: "errorContainer", fg: "onErrorContainer" }
            : accent === "secondary"
              ? { bg: "secondaryContainer", fg: "onSecondaryContainer" }
              : { bg: "primaryContainer", fg: "onPrimaryContainer" };

  const body = (
    <Stack direction="row" spacing={2} alignItems="center">
      <Box
        aria-hidden
        sx={{
          width: 48,
          height: 48,
          borderRadius: 3,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          color: containerKey.fg,
          // Tonal gradient + soft shadow for a richer, dimensional tile (palette-only).
          background: `linear-gradient(135deg, var(--mui-palette-${containerKey.bg}), color-mix(in srgb, var(--mui-palette-${containerKey.fg}) 16%, var(--mui-palette-${containerKey.bg})))`,
          boxShadow: `0 4px 12px color-mix(in srgb, var(--mui-palette-${containerKey.bg}) 55%, transparent)`,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4 }}>
          {label}
        </Typography>
        {loading ? (
          <Skeleton width={64} height={32} />
        ) : (
          <Typography variant="h5" fontWeight={600} sx={{ lineHeight: 1.2 }}>
            {value}
          </Typography>
        )}
        {helper && (
          <Typography variant="caption" color="text.secondary">
            {helper}
          </Typography>
        )}
      </Box>
    </Stack>
  );

  const interactive = Boolean(href || onClick);

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: selected ? "primary.main" : "outlineVariant",
        bgcolor: selected ? "primaryContainer" : undefined,
        height: "100%",
        ...(interactive ? interactiveSurfaceSx : {}),
        ...(selected ? { "&:hover": { borderColor: "primary.main" } } : {}),
      }}
    >
      {interactive ? (
        <CardActionArea
          {...(href ? { component: NextLink, href } : {})}
          onClick={onClick}
          aria-label={ariaLabel ?? label}
          aria-pressed={onClick ? selected : undefined}
          sx={{ p: 2.5, height: "100%", borderRadius: "inherit" }}
        >
          {body}
        </CardActionArea>
      ) : (
        <Box sx={{ p: 2.5, height: "100%" }}>{body}</Box>
      )}
    </Card>
  );
}
