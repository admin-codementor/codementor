"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { classifyApiError, type ClassifiedError } from "@/lib/apiError";
import { radius } from "@/theme/tokens";
import {
  CloudOffIcon,
  ErrorOutlineIcon,
  FilterXIcon,
  InboxIcon,
  LockOutlinedIcon,
  RefreshIcon,
  SearchIcon,
  TimerOutlinedIcon,
} from "./icons";

/**
 * Empty and error states.
 *
 * These are different things and must never look alike: "nothing here yet" is an
 * invitation to act, while "we couldn't load this" is a failure the person can
 * retry. Pages that swallowed errors made the two identical, which is how a
 * permissions bug got reported as "class creation is broken".
 */

type Tone = "neutral" | "error";

/** Why a screen is empty. Each kind needs different words and a different action. */
export type EmptyVariant =
  /** The person hasn't started yet — point them at the first step. */
  | "firstUse"
  /** Their search or filter matched nothing — offer to clear it. */
  | "filtered"
  /** Nothing has been assigned to them — no action they can take. */
  | "unassigned";

/** Centred empty state with an icon or illustration, message, and optional action. */
const VARIANT_ICON: Record<EmptyVariant, React.ReactNode> = {
  firstUse: <InboxIcon fontSize="medium" />,
  filtered: <FilterXIcon fontSize="medium" />,
  unassigned: <InboxIcon fontSize="medium" />,
};

export function EmptyState({
  icon,
  illustration,
  title,
  description,
  action,
  variant,
  tone = "neutral",
  compact = false,
}: {
  icon?: React.ReactNode;
  /** Takes the place of the icon tile — for the larger, friendlier empty screens. */
  illustration?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Picks a fitting default icon when `icon` isn't given. See {@link EmptyVariant}. */
  variant?: EmptyVariant;
  tone?: Tone;
  /** Tighter padding, for an empty section inside a card rather than a whole page. */
  compact?: boolean;
}) {
  const container = tone === "error" ? "errorContainer" : "primaryContainer";
  const onContainer = tone === "error" ? "onErrorContainer" : "onPrimaryContainer";
  const resolvedIcon = icon ?? (variant ? VARIANT_ICON[variant] : undefined);

  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={1.5}
      sx={{ py: compact ? 4 : 8, px: 3, textAlign: "center" }}
    >
      {illustration ?? (
        resolvedIcon && (
          <Box
            aria-hidden
            sx={{
              width: compact ? 48 : 64,
              height: compact ? 48 : 64,
              borderRadius: radius.circle,
              display: "grid",
              placeItems: "center",
              color: onContainer,
              mb: 0.5,
              background: `linear-gradient(135deg, var(--mui-palette-${container}), color-mix(in srgb, var(--mui-palette-${onContainer}) 16%, var(--mui-palette-${container})))`,
              boxShadow: `0 4px 12px color-mix(in srgb, var(--mui-palette-${container}) 55%, transparent)`,
            }}
          >
            {resolvedIcon}
          </Box>
        )
      )}
      <Typography variant={compact ? "subtitle1" : "h6"}>{title}</Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 1 }}>{action}</Box>}
    </Stack>
  );
}

const ERROR_ICON: Record<ClassifiedError["kind"], React.ReactNode> = {
  offline: <CloudOffIcon fontSize="medium" />,
  server: <ErrorOutlineIcon fontSize="medium" />,
  forbidden: <LockOutlinedIcon fontSize="medium" />,
  notFound: <SearchIcon fontSize="medium" />,
  timeout: <TimerOutlinedIcon fontSize="medium" />,
  unknown: <ErrorOutlineIcon fontSize="medium" />,
};

/**
 * Failure state. Pass the caught `error` and it explains itself — offline, server
 * problem, no access, missing, or slow — and only offers Retry when retrying
 * could actually help.
 */
export function ErrorState({
  error,
  title,
  description,
  onRetry,
  compact = false,
}: {
  error?: unknown;
  title?: string;
  description?: React.ReactNode;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const classified = classifyApiError(error);
  const canRetry = onRetry && (error === undefined || classified.retryable);

  return (
    <EmptyState
      tone="error"
      compact={compact}
      icon={ERROR_ICON[classified.kind]}
      title={title ?? classified.title}
      description={description ?? classified.description}
      action={
        canRetry ? (
          <Button variant="outlined" onClick={onRetry} startIcon={<RefreshIcon fontSize="small" />}>
            Try again
          </Button>
        ) : undefined
      }
    />
  );
}

/**
 * Compact failure notice for one section of a page that otherwise loaded. Use
 * this instead of blanking the whole screen when a single request fails.
 */
export function InlineError({
  error,
  onRetry,
  title,
}: {
  error?: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const classified = classifyApiError(error);
  const canRetry = onRetry && (error === undefined || classified.retryable);

  return (
    <Alert
      severity="error"
      variant="outlined"
      sx={{ borderRadius: radius.sm }}
      action={
        canRetry ? (
          <Button color="inherit" size="small" onClick={onRetry}>
            Retry
          </Button>
        ) : undefined
      }
    >
      <AlertTitle sx={{ mb: 0.25 }}>{title ?? classified.title}</AlertTitle>
      {classified.description}
    </Alert>
  );
}

/**
 * Shown when a request failed but we still have earlier data on screen. Saying
 * so is better than silently presenting stale numbers as current.
 */
export function StaleBanner({ since, onRetry }: { since?: Date | number | null; onRetry?: () => void }) {
  const time = since
    ? new Date(since).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <Alert
      severity="warning"
      variant="outlined"
      icon={<CloudOffIcon fontSize="small" />}
      sx={{ borderRadius: radius.sm }}
      action={
        onRetry ? (
          <Button color="inherit" size="small" onClick={onRetry}>
            Refresh
          </Button>
        ) : undefined
      }
    >
      {/*
        The server and the browser format this differently (locale and time
        zone differ — "10:02 am" vs "10:02 AM"), which fails hydration. The time
        is only meaningful in the reader's own zone, so let the client value win.
      */}
      <span suppressHydrationWarning>
        {time ? `Couldn't refresh — showing data from ${time}.` : "Couldn't refresh — showing saved data."}
      </span>
    </Alert>
  );
}
