"use client";

import * as React from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import Collapse from "@mui/material/Collapse";
import ButtonBase from "@mui/material/ButtonBase";
import {
  TrendingUpIcon,
  TrendingDownIcon,
  ArrowForwardIcon,
  ExpandMoreIcon,
  CheckCircleIcon,
} from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { CardGridSkeleton } from "@/components/ui/Skeletons";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { Reveal } from "@/components/ui/motion";
import { radius, layout } from "@/theme/tokens";
import { useJobReadyQuery, type ScoreTarget, type ScoreComponent } from "@/lib/queries/jobReady";

/**
 * The Job-Ready Score.
 *
 * The rule this page is built around: a student must be able to work out why
 * the number is what it is. So every component shows its own score, what it is
 * worth, and the raw figures behind it — and the three actions underneath are
 * the ones that would move it most, not a generic list.
 */

const scoreColor = (score: number) => (score >= 70 ? "success" : score >= 40 ? "warning" : "error");

function ScoreDial({ score, size = 132 }: { score: number; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const tone = scoreColor(score);

  return (
    <Box sx={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <Box
        component="svg"
        aria-hidden
        viewBox={`0 0 ${size} ${size}`}
        sx={{ width: size, height: size, transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          stroke="var(--mui-palette-outlineVariant)"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          stroke={`var(--mui-palette-${tone}-main)`}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </Box>
      <Stack
        sx={{ position: "absolute", inset: 0 }}
        alignItems="center"
        justifyContent="center"
        spacing={0}
      >
        <Typography variant="h3" fontWeight={700} sx={{ lineHeight: 1 }}>
          {score}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          out of 100
        </Typography>
      </Stack>
    </Box>
  );
}

function WeekChange({ change }: { change: number }) {
  if (change === 0) {
    return (
      <Typography variant="caption" color="text.secondary">
        No change this week
      </Typography>
    );
  }
  const up = change > 0;
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      {up ? (
        <TrendingUpIcon fontSize="small" sx={{ color: "success.main" }} />
      ) : (
        <TrendingDownIcon fontSize="small" sx={{ color: "warning.main" }} />
      )}
      <Typography variant="caption" fontWeight={600} color={up ? "success.main" : "warning.main"}>
        {up ? "+" : ""}{change} this week
      </Typography>
    </Stack>
  );
}

/** The one line of raw numbers that explains a component's own score. */
function componentEvidence(c: ScoreComponent): string {
  const d = c.data as Record<string, never> & Record<string, number | string | unknown[]>;
  switch (c.key) {
    case "coverage":
      return `${d.got} of ${d.target} problems across ${(d.topics as unknown[])?.length ?? 0} topics`;
    case "difficulty":
      return `${d.share}% of your solves are medium or harder — this target wants about ${d.shareTarget}%`;
    case "consistency":
      return `Active on ${d.activeDays} of the last 30 days — ${d.targetDays} days is full marks`;
    case "aptitude":
      return d.taken ? `${d.averagePercent}% average across ${d.taken} test${d.taken === 1 ? "" : "s"}` : "No tests sat yet";
    case "roadmap":
      return d.following ? `${c.score}% along your roadmap` : "Not following a roadmap yet";
    case "courses":
      return `${d.done} of ${d.assigned} course problems solved — ${d.target} is full marks`;
    case "external":
      return (d.verified as unknown[])?.length ? `${(d.verified as unknown[]).length} verified account` : "No verified account linked";
    default:
      return "";
  }
}

function ComponentRow({ component }: { component: ScoreComponent }) {
  return (
    <Box sx={{ py: 1.25 }}>
      <Stack direction="row" spacing={1} alignItems="baseline" justifyContent="space-between">
        <Typography variant="body2" fontWeight={600}>
          {component.label}
        </Typography>
        <Stack direction="row" spacing={1} alignItems="baseline">
          <Typography variant="caption" color="text.secondary">
            worth {component.weight}
          </Typography>
          <Typography variant="body2" fontWeight={700} sx={{ minWidth: 52, textAlign: "right" }}>
            {component.contributes} / {component.weight}
          </Typography>
        </Stack>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={component.score}
        color={scoreColor(component.score)}
        sx={{ height: 5, borderRadius: radius.full, mt: 0.75 }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
        {componentEvidence(component)}
      </Typography>
    </Box>
  );
}

function TargetCard({ target }: { target: ScoreTarget }) {
  const [showWorkings, setShowWorkings] = React.useState(false);

  return (
    <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: layout.cardPadding }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={3} alignItems={{ xs: "center", sm: "flex-start" }}>
        <ScoreDial score={target.score} />

        <Box sx={{ flex: 1, minWidth: 0, width: "100%" }}>
          <Typography variant="h6" fontWeight={700}>
            {target.label}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {target.blurb}
          </Typography>
          <Box sx={{ mt: 1 }}>
            <WeekChange change={target.weekChange} />
          </Box>

          <Typography variant="overline" color="text.secondary" sx={{ display: "block", mt: 2.5 }}>
            Your next three things
          </Typography>
          <Stack spacing={1} sx={{ mt: 0.5 }}>
            {target.nextActions.length === 0 ? (
              <Stack direction="row" spacing={0.75} alignItems="center">
                <CheckCircleIcon fontSize="small" sx={{ color: "success.main" }} />
                <Typography variant="body2" color="success.main">
                  Nothing outstanding for this target.
                </Typography>
              </Stack>
            ) : (
              target.nextActions.map((a) => (
                <Card
                  key={a.label}
                  variant="outlined"
                  sx={{ borderColor: "outlineVariant", borderRadius: radius.sm }}
                >
                  <ButtonBase
                    component={NextLink}
                    href={a.href}
                    sx={{ width: "100%", px: 1.5, py: 1.25, justifyContent: "space-between", borderRadius: "inherit", textAlign: "left" }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {a.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {a.why}
                      </Typography>
                    </Box>
                    <ArrowForwardIcon fontSize="small" sx={{ color: "text.secondary", ml: 1, flexShrink: 0 }} />
                  </ButtonBase>
                </Card>
              ))
            )}
          </Stack>
        </Box>
      </Stack>

      <Box sx={{ mt: 2.5, borderTop: "1px solid", borderColor: "outlineVariant", pt: 1 }}>
        <Button
          size="small"
          onClick={() => setShowWorkings((v) => !v)}
          endIcon={
            <ExpandMoreIcon
              fontSize="small"
              sx={{ transition: "transform 150ms", transform: showWorkings ? "rotate(180deg)" : "none" }}
            />
          }
          aria-expanded={showWorkings}
        >
          {showWorkings ? "Hide the workings" : "How is this calculated?"}
        </Button>
        <Collapse in={showWorkings} unmountOnExit>
          <Box sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: layout.proseMaxWidth, mb: 1 }}>
              Each part is scored out of 100 and counts for the share shown. Add the contributions
              together and you get {target.score}.
            </Typography>
            <Stack divider={<Box sx={{ borderTop: "1px solid", borderColor: "outlineVariant" }} />}>
              {target.components.map((c) => (
                <ComponentRow key={c.key} component={c} />
              ))}
            </Stack>
          </Box>
        </Collapse>
      </Box>
    </Card>
  );
}

export default function PlacementPage() {
  const query = useJobReadyQuery();
  const targets = query.data?.targets ?? [];
  const [selected, setSelected] = React.useState<string | null>(null);

  const current = targets.find((t) => t.key === selected) ?? targets[0];

  return (
    <Box>
      <PageHeader
        title="Job-Ready Score"
        subtitle="How ready you are for each kind of recruiter, and the three things that would move it most."
      />

      <DataState
        loading={query.isLoading}
        fetching={query.isFetching && !query.isLoading}
        error={query.isError ? query.error : undefined}
        empty={targets.length === 0}
        onRetry={query.refetch}
        skeleton={<CardGridSkeleton count={1} height={320} minWidth={320} />}
        emptyTitle="No targets to score against"
        emptyDescription="This appears once your college has published problems to practise."
      >
        {current && (
          <Reveal>
            <Stack spacing={layout.sectionGap}>
              {targets.length > 1 && (
                <SegmentedButtons<string>
                  value={current.key}
                  onChange={setSelected}
                  segments={targets.map((t) => ({ value: t.key, label: t.label }))}
                  ariaLabel="Which kind of company to score against"
                />
              )}

              <TargetCard target={current} />

              {!query.data?.roleTargetAvailable && (
                <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: layout.cardPadding }}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    Scoring against your own role
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: layout.proseMaxWidth }}>
                    Follow a roadmap and a third score appears here, measured against that role rather
                    than against a company type.
                  </Typography>
                  <Button
                    component={NextLink}
                    href="/app/roadmaps"
                    size="small"
                    variant="outlined"
                    endIcon={<ArrowForwardIcon />}
                    sx={{ mt: 1.5 }}
                  >
                    Browse roadmaps
                  </Button>
                </Card>
              )}

              <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: layout.cardPadding }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Chip size="small" label="Verified by our judge" color="primary" variant="outlined" />
                  <Typography variant="body2" color="text.secondary">
                    Every figure here comes from problems you actually passed, tests you actually sat,
                    and accounts you have proved are yours.
                  </Typography>
                </Stack>
              </Card>
            </Stack>
          </Reveal>
        )}
      </DataState>
    </Box>
  );
}
