"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import { ErrorState, EmptyState, type EmptyVariant } from "./States";

/**
 * One wrapper for every data-bound view, so loading, empty and failure look the
 * same everywhere and no request can fail silently.
 *
 * Before this, roughly two dozen pages did `.catch(() => {})`, which made "the
 * request failed" render exactly like "there is nothing here". A student had no
 * way to tell a broken backend from an empty course.
 *
 *   <DataState
 *     loading={q.isLoading}
 *     fetching={q.isFetching}
 *     error={q.isError ? q.error : undefined}
 *     empty={courses.length === 0}
 *     onRetry={q.refetch}
 *     skeleton={<CardGridSkeleton />}
 *     emptyTitle="No courses yet"
 *     emptyDescription="Courses your faculty assigns will appear here."
 *   >
 *     {courses.map(...)}
 *   </DataState>
 *
 * Order matters: loading wins over error, and error wins over empty — a failed
 * request must never be reported to the person as "nothing here".
 */
export interface DataStateProps {
  /** First load, with nothing to show yet. */
  loading?: boolean;
  /** Refetching while existing content stays on screen. Shows a thin progress line. */
  fetching?: boolean;
  /** The caught failure. Leave undefined when the request succeeded. */
  error?: unknown;
  /** True when the request succeeded but returned nothing. */
  empty?: boolean;
  /** Loading placeholder shaped like the real content. */
  skeleton?: React.ReactNode;
  onRetry?: () => void;

  /** Why it's empty — picks a fitting icon. */
  emptyVariant?: EmptyVariant;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
  emptyAction?: React.ReactNode;
  /** Replaces the whole empty state when you need something custom. */
  emptyState?: React.ReactNode;

  /** Renders failures compactly, for a section rather than a whole page. */
  compact?: boolean;
  children: React.ReactNode;
}

export function DataState({
  loading,
  fetching,
  error,
  empty,
  skeleton,
  onRetry,
  emptyVariant = "firstUse",
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyAction,
  emptyState,
  compact,
  children,
}: DataStateProps) {
  if (loading) {
    return <>{skeleton ?? <LinearProgress aria-label="Loading" />}</>;
  }

  if (error !== undefined && error !== null && error !== false) {
    return <ErrorState error={error} onRetry={onRetry} compact={compact} />;
  }

  if (empty) {
    return (
      <>
        {emptyState ?? (
          <EmptyState
            variant={emptyVariant}
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
            compact={compact}
          />
        )}
      </>
    );
  }

  return (
    <Box sx={{ position: "relative" }}>
      {fetching && (
        <LinearProgress
          aria-label="Refreshing"
          sx={{
            position: "absolute",
            insetInline: 0,
            top: 0,
            height: 2,
            borderRadius: 0,
            zIndex: 1,
          }}
        />
      )}
      {children}
    </Box>
  );
}
