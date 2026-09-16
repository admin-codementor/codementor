"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

/** Centered empty state with an icon, message, and optional action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={1.5}
      sx={{ py: 8, px: 3, textAlign: "center" }}
    >
      {icon && (
        <Box
          aria-hidden
          sx={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            color: "onPrimaryContainer",
            mb: 0.5,
            // Tonal gradient + soft colored shadow — same dimensional-tile
            // technique as StatCard's icon tile, so every empty state
            // app-wide picks up the richer look for free.
            background: "linear-gradient(135deg, var(--mui-palette-primaryContainer), color-mix(in srgb, var(--mui-palette-onPrimaryContainer) 16%, var(--mui-palette-primaryContainer)))",
            boxShadow: "0 4px 12px color-mix(in srgb, var(--mui-palette-primaryContainer) 55%, transparent)",
          }}
        >
          {icon}
        </Box>
      )}
      <Typography variant="h6">{title}</Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 1 }}>{action}</Box>}
    </Stack>
  );
}

/** Error state with a retry affordance. */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this content. Please try again.",
  onRetry,
}: {
  title?: string;
  description?: React.ReactNode;
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      title={title}
      description={description}
      action={
        onRetry ? (
          <Button variant="outlined" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    />
  );
}
