"use client";

import * as React from "react";
import { notFound } from "next/navigation";
import type { AxiosError } from "axios";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { InteractiveCard } from "@/components/ui/InteractiveCard";
import { DataState } from "@/components/ui/DataState";
import { EmptyState, ErrorState, InlineError, StaleBanner } from "@/components/ui/States";
import {
  CardGridSkeleton,
  ListSkeleton,
  SectionSkeleton,
  StatRowSkeleton,
  TableSkeleton,
  TextSkeleton,
} from "@/components/ui/Skeletons";
import { QuickAccess } from "@/components/student/quick-access/QuickAccess";
import { layout, radius } from "@/theme/tokens";
import { MenuBookOutlinedIcon } from "@/components/ui/icons";

/**
 * Dev-only gallery of every shared state and surface. This is the review
 * surface: if a state isn't here, it isn't designed, and pages will keep
 * inventing their own. 404s in production builds.
 */

/** Fakes the axios shapes `classifyApiError` reads, so each failure renders truthfully. */
const fakeError = (status?: number, code?: string): AxiosError =>
  ({
    code,
    request: {},
    response: status ? { status, data: {} } : undefined,
  }) as unknown as AxiosError;

function Demo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
        {label}
      </Typography>
      <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
        <CardContent sx={{ p: layout.cardPaddingCompact, "&:last-child": { pb: layout.cardPaddingCompact } }}>
          {children}
        </CardContent>
      </Card>
    </Box>
  );
}

function Grid({ children, min = 320 }: { children: React.ReactNode; min?: number }) {
  return (
    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}>
      {children}
    </Box>
  );
}

export default function StatesGallery() {
  if (process.env.NODE_ENV === "production") notFound();

  const [selected, setSelected] = React.useState(false);
  const [retries, setRetries] = React.useState(0);
  // Computed once on mount, not on every render, so the demo timestamp is stable.
  const [staleSince] = React.useState(() => Date.now() - 23 * 60 * 1000);
  const [demoNow] = React.useState(() => Date.now());

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", p: layout.pageGutter }}>
      <PageHeader
        title="Component states"
        subtitle="Every state a data-bound view can be in. Loading beats error, error beats empty — a failed request is never shown as “nothing here”."
      />

      <Stack spacing={layout.sectionGap}>
        {/* ── Failures ─────────────────────────────────────────────────── */}
        <SectionCard title="Failure states — each one explains itself and only offers Retry when retrying can help">
          <Grid>
            <Demo label="Offline">
              <ErrorState compact error={fakeError()} onRetry={() => setRetries((n) => n + 1)} />
            </Demo>
            <Demo label="Server problem (500)">
              <ErrorState compact error={fakeError(500)} onRetry={() => setRetries((n) => n + 1)} />
            </Demo>
            <Demo label="No access (403) — no Retry offered">
              <ErrorState compact error={fakeError(403)} onRetry={() => setRetries((n) => n + 1)} />
            </Demo>
            <Demo label="Not found (404) — no Retry offered">
              <ErrorState compact error={fakeError(404)} onRetry={() => setRetries((n) => n + 1)} />
            </Demo>
            <Demo label="Timed out">
              <ErrorState compact error={fakeError(undefined, "ECONNABORTED")} onRetry={() => setRetries((n) => n + 1)} />
            </Demo>
            <Demo label="Unknown">
              <ErrorState compact onRetry={() => setRetries((n) => n + 1)} />
            </Demo>
          </Grid>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: "block" }}>
            Retry pressed {retries} time{retries === 1 ? "" : "s"} — proves the handler is wired, nothing is fetched here.
          </Typography>
        </SectionCard>

        {/* ── Partial / stale ──────────────────────────────────────────── */}
        <SectionCard title="Section-level failure and stale data — the rest of the page keeps working">
          <Stack spacing={2}>
            <Demo label="One section failed">
              <InlineError error={fakeError(500)} onRetry={() => setRetries((n) => n + 1)} />
            </Demo>
            <Demo label="Section the person cannot see">
              <InlineError error={fakeError(403)} />
            </Demo>
            <Demo label="Refresh failed, older data still shown">
              <StaleBanner since={staleSince} onRetry={() => setRetries((n) => n + 1)} />
            </Demo>
          </Stack>
        </SectionCard>

        {/* ── Empty ────────────────────────────────────────────────────── */}
        <SectionCard title="Empty states — three different situations, three different messages">
          <Grid>
            <Demo label="First use — invites action">
              <EmptyState
                compact
                variant="firstUse"
                title="No courses yet"
                description="Start a course and your progress will show up here."
                action={<Button variant="contained" size="small">Browse courses</Button>}
              />
            </Demo>
            <Demo label="Filtered — offers a way back">
              <EmptyState
                compact
                variant="filtered"
                title="No problems match “binary tree”"
                description="Try a different search, or clear the filters."
                action={<Button variant="outlined" size="small">Clear filters</Button>}
              />
            </Demo>
            <Demo label="Nothing assigned — no action to offer">
              <EmptyState
                compact
                variant="unassigned"
                title="No assignments right now"
                description="When your faculty sets one, it appears here with its due date."
              />
            </Demo>
          </Grid>
        </SectionCard>

        {/* ── Loading ──────────────────────────────────────────────────── */}
        <SectionCard title="Loading — shaped like the content, never a centred spinner">
          <Stack spacing={2}>
            <Demo label="Stat row"><StatRowSkeleton /></Demo>
            <Demo label="Card grid"><CardGridSkeleton count={3} /></Demo>
            <Demo label="List"><ListSkeleton rows={3} showAvatar /></Demo>
            <Demo label="Table"><TableSkeleton rows={3} /></Demo>
            <Demo label="Prose"><TextSkeleton /></Demo>
            <Demo label="Whole section"><SectionSkeleton height={80} /></Demo>
          </Stack>
        </SectionCard>

        {/* ── DataState end to end ─────────────────────────────────────── */}
        <SectionCard title="DataState — the wrapper pages actually use">
          <Grid min={340}>
            <Demo label="loading">
              <DataState loading skeleton={<ListSkeleton rows={2} />}>
                <div>never seen</div>
              </DataState>
            </Demo>
            <Demo label="error beats empty">
              <DataState compact error={fakeError(500)} empty onRetry={() => setRetries((n) => n + 1)}>
                <div>never seen</div>
              </DataState>
            </Demo>
            <Demo label="empty">
              <DataState
                compact
                empty
                emptyTitle="No submissions yet"
                emptyDescription="Solve a problem and it shows up here."
              >
                <div>never seen</div>
              </DataState>
            </Demo>
            <Demo label="success, refreshing in background">
              <DataState fetching>
                <Typography variant="body2" sx={{ pt: 1 }}>
                  Real content stays on screen; the thin line above shows a refresh.
                </Typography>
              </DataState>
            </Demo>
          </Grid>
        </SectionCard>

        {/* ── Interactive surfaces ─────────────────────────────────────── */}
        <SectionCard title="Interactive surfaces — one hover, focus and pressed treatment everywhere">
          <Grid min={240}>
            <InteractiveCard href="#" ariaLabel="Example link card">
              <Box sx={{ p: layout.cardPadding }}>
                <MenuBookOutlinedIcon />
                <Typography variant="subtitle2" sx={{ mt: 1 }}>Link card</Typography>
                <Typography variant="body2" color="text.secondary">Renders a real link. Tab to it.</Typography>
              </Box>
            </InteractiveCard>

            <InteractiveCard onClick={() => setSelected((v) => !v)} selected={selected} ariaLabel="Toggle selected">
              <Box sx={{ p: layout.cardPadding }}>
                <Typography variant="subtitle2">Toggle card</Typography>
                <Typography variant="body2" color="text.secondary">
                  {selected ? "Selected — click to clear" : "Click to select"}
                </Typography>
              </Box>
            </InteractiveCard>

            <InteractiveCard disabled ariaLabel="Disabled card">
              <Box sx={{ p: layout.cardPadding }}>
                <Typography variant="subtitle2">Disabled</Typography>
                <Typography variant="body2" color="text.secondary">Not focusable, no hover.</Typography>
              </Box>
            </InteractiveCard>
          </Grid>
        </SectionCard>

        {/* ── Quick Access tiles ───────────────────────────────────────── */}
        <SectionCard title="Quick access tiles — the dashboard entry row, with live lines">
          <QuickAccess
            stats={{ totalSubs: 48, acRate: 62, problemsSolved: 31, streak: 5, rank: 7, rating: 1200 }}
            courses={[
              { id: "java", title: "Java Fundamentals", description: null, moduleCount: 6, problemCount: 40, solvedCount: 25 },
              { id: "dsa", title: "Data Structures", description: null, moduleCount: 8, problemCount: 60, solvedCount: 4 },
            ]}
            assignments={[
              { id: "a1", title: "Arrays practice set", deadline: new Date(demoNow + 2 * 86400000).toISOString(), isExam: false, total: 5, solved: 2, problems: [] },
              { id: "a2", title: "Recursion drill", deadline: new Date(demoNow + 5 * 86400000).toISOString(), isExam: false, total: 4, solved: 0, problems: [] },
            ]}
            exams={[
              {
                id: "e1", title: "Mid-term Coding Test", description: null,
                window_start: new Date(demoNow + 3 * 86400000).toISOString(),
                window_end: new Date(demoNow + 3 * 86400000 + 7200000).toISOString(),
                duration_minutes: 90, section_count: 2, started: false, attempted: false, score: null, total: null,
              },
            ]}
            className="CSE-A"
          />
          <Typography variant="caption" color="text.secondary">
            Same component the dashboard renders, with stand-in data. Resize to phone width to see the row scroll
            sideways instead of stacking.
          </Typography>
        </SectionCard>

        {/* ── Shape scale ──────────────────────────────────────────────── */}
        <SectionCard title="Corner radius — use these names, never a bare number in sx">
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            {(["xs", "sm", "md", "lg", "xl", "full"] as const).map((key) => (
              <Stack key={key} spacing={0.5} alignItems="center">
                <Box
                  sx={{
                    width: 88,
                    height: 56,
                    borderRadius: radius[key],
                    bgcolor: "secondaryContainer",
                    border: "1px solid",
                    borderColor: "outlineVariant",
                  }}
                />
                <Typography variant="caption">radius.{key}</Typography>
                <Typography variant="caption" color="text.secondary">{radius[key]}</Typography>
              </Stack>
            ))}
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Stack direction="row" spacing={2} alignItems="center">
            <Box
              sx={{
                width: 88,
                height: 56,
                borderRadius: 2,
                bgcolor: "errorContainer",
                border: "1px solid",
                borderColor: "error.main",
              }}
            />
            <Typography variant="body2" color="text.secondary">
              <strong>borderRadius: 2</strong> renders <strong>24px</strong>, not 8px — MUI multiplies bare numbers
              by the theme radius of 12. This is the mistake the lint rule now blocks.
            </Typography>
          </Stack>
        </SectionCard>
      </Stack>
    </Box>
  );
}
