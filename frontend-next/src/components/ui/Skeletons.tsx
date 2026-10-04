"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import { layout, radius } from "@/theme/tokens";

/**
 * Loading placeholders shaped like the content they stand in for.
 *
 * A centred spinner tells someone only that *something* is happening; a shape
 * tells them what is about to appear and stops the page jumping when it does.
 * Reach for the closest match here before writing a one-off `<Skeleton>`.
 */

/** Rows of text, for lists and feeds. */
export function ListSkeleton({ rows = 5, showAvatar = false }: { rows?: number; showAvatar?: boolean }) {
  return (
    <Stack spacing={1.5} aria-busy aria-live="polite" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Stack key={i} direction="row" spacing={1.5} alignItems="center">
          {showAvatar && <Skeleton variant="circular" width={36} height={36} />}
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width={`${60 + ((i * 7) % 30)}%`} />
            <Skeleton variant="text" width="35%" />
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}

/** A grid of cards, for dashboards and course/problem listings. */
export function CardGridSkeleton({
  count = 6,
  height = 140,
  minWidth = 260,
}: {
  count?: number;
  height?: number;
  minWidth?: number;
}) {
  return (
    <Box
      aria-busy
      aria-live="polite"
      aria-label="Loading"
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={height} sx={{ borderRadius: radius.md }} />
      ))}
    </Box>
  );
}

/** A row of headline numbers. */
export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Box
      aria-busy
      aria-live="polite"
      aria-label="Loading"
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: { xs: "repeat(2, 1fr)", md: `repeat(${count}, 1fr)` },
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={96} sx={{ borderRadius: radius.md }} />
      ))}
    </Box>
  );
}

/** A table body, matching the real column count so the header doesn't shift. */
export function TableSkeleton({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <Stack spacing={1} aria-busy aria-live="polite" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <Stack key={r} direction="row" spacing={2} alignItems="center">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} variant="text" sx={{ flex: c === 0 ? 2 : 1 }} />
          ))}
        </Stack>
      ))}
    </Stack>
  );
}

/** A block of prose. */
export function TextSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <Box aria-busy aria-live="polite" aria-label="Loading" sx={{ maxWidth: layout.proseMaxWidth }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} variant="text" width={i === lines - 1 ? "55%" : "100%"} />
      ))}
    </Box>
  );
}

/** A titled card with body content, for a single section still loading. */
export function SectionSkeleton({ height = 200 }: { height?: number }) {
  return (
    <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
      <CardContent sx={{ p: layout.cardPadding }}>
        <Skeleton variant="text" width={160} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={height} sx={{ borderRadius: radius.sm }} />
      </CardContent>
    </Card>
  );
}
