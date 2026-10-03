"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { EmptyState, ErrorState } from "@/components/ui/States";

/**
 * The one shell every analytics chart sits in: title, a one-line takeaway
 * (what to *read* from the chart), an action slot, and built-in
 * loading / empty / error handling so pages don't each reinvent them.
 * `height` is fixed so the card never jumps when data arrives.
 */
export function ChartCard({
  title,
  subtitle,
  action,
  height = 280,
  loading = false,
  error = false,
  onRetry,
  empty,
  emptyTitle = "Nothing to show yet",
  emptyDescription,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  height?: number;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  /** True when the dataset is empty — shows a designed empty state. */
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
  children: React.ReactNode;
}) {
  let content: React.ReactNode;
  if (loading) content = <Skeleton variant="rounded" height={height} />;
  else if (error) content = <ErrorState onRetry={onRetry} />;
  else if (empty)
    content = (
      <Box sx={{ minHeight: height, display: "grid", placeItems: "center" }}>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </Box>
    );
  else content = <Box sx={{ minHeight: height }}>{children}</Box>;

  return (
    <Card variant="outlined" sx={{ borderColor: "outlineVariant", height: "100%" }}>
      <Box sx={{ p: 2.5 }}>
        <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 2 }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle2" fontWeight={600}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          {action}
        </Stack>
        {content}
      </Box>
    </Card>
  );
}
