"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Card from "@mui/material/Card";
import Step from "@mui/material/Step";
import Stepper from "@mui/material/Stepper";
import StepButton from "@mui/material/StepButton";
import CircularProgress from "@mui/material/CircularProgress";
import Tooltip from "@mui/material/Tooltip";
import { ChevronLeftIcon, ChevronRightIcon, CheckIcon, CheckCircleIcon, ErrorOutlineIcon } from "@/components/ui/icons";

/**
 * Shared frame for the multi-step authoring flows (problems, assignments, MCQ
 * tests). It owns the step chrome, the save indicator and the navigation, so each
 * flow only supplies its step content.
 *
 * The save indicator is the point of the thing: authoring used to happen in a
 * modal dialog where closing the tab lost everything and there was no signal that
 * work had been stored. Here every flow writes to a draft continuously and says so.
 */
export type SaveState = "idle" | "saving" | "saved" | "error";

export interface AuthoringStep {
  label: string;
  /** Shown under the title when this step is active. */
  hint?: string;
  content: React.ReactNode;
  /** Blocks forward navigation and is surfaced as a tooltip when set. */
  blockedReason?: string;
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry?: () => void }) {
  if (state === "saving") {
    return (
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: "text.secondary" }}>
        <CircularProgress size={13} thickness={5} />
        <Typography variant="caption">Saving…</Typography>
      </Stack>
    );
  }
  if (state === "saved") {
    return (
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: "success.main" }}>
        <CheckCircleIcon sx={{ fontSize: 16 }} />
        <Typography variant="caption">Draft saved</Typography>
      </Stack>
    );
  }
  if (state === "error") {
    return (
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: "error.main" }}>
        <ErrorOutlineIcon sx={{ fontSize: 16 }} />
        <Typography variant="caption">Not saved</Typography>
        {onRetry && <Button size="small" onClick={onRetry} sx={{ minWidth: 0, p: 0.25 }}>Retry</Button>}
      </Stack>
    );
  }
  return null;
}

export function AuthoringShell({
  title,
  subtitle,
  statusChip,
  steps,
  step,
  onStepChange,
  saveState,
  onRetrySave,
  onExit,
  finalAction,
}: {
  title: string;
  subtitle?: string;
  statusChip?: React.ReactNode;
  steps: AuthoringStep[];
  step: number;
  onStepChange: (next: number) => void;
  saveState: SaveState;
  onRetrySave?: () => void;
  onExit: () => void;
  /** Rendered instead of "Next" on the last step. */
  finalAction?: React.ReactNode;
}) {
  const current = steps[step];
  const isLast = step === steps.length - 1;
  const blocked = current?.blockedReason;

  return (
    <Box>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <Box sx={{ minWidth: 0 }}>
          <Button startIcon={<ChevronLeftIcon />} onClick={onExit} size="small" sx={{ mb: 0.5, ml: -1 }}>
            Back to problems
          </Button>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="h5" fontWeight={600} sx={{ wordBreak: "break-word" }}>
              {title || "Untitled"}
            </Typography>
            {statusChip}
          </Stack>
          {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
        </Box>
        <SaveIndicator state={saveState} onRetry={onRetrySave} />
      </Stack>

      <Stepper nonLinear activeStep={step} sx={{ mb: 3 }}>
        {steps.map((s, i) => (
          <Step key={s.label} completed={i < step}>
            {/* Steps are clickable so a faculty member can jump back to fix one
                thing without walking the whole flow again. */}
            <StepButton onClick={() => onStepChange(i)}>{s.label}</StepButton>
          </Step>
        ))}
      </Stepper>

      {current?.hint && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{current.hint}</Typography>
      )}

      <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: { xs: 2, md: 3 }, mb: 2 }}>
        {current?.content}
      </Card>

      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
        <Button startIcon={<ChevronLeftIcon />} disabled={step === 0} onClick={() => onStepChange(step - 1)}>
          Previous
        </Button>
        <Stack direction="row" spacing={1} alignItems="center">
          {step < steps.length - 1 && (
            <Chip size="small" label={`Step ${step + 1} of ${steps.length}`} sx={{ bgcolor: "surfaceContainerHigh", color: "onSurfaceVariant" }} />
          )}
          {isLast ? finalAction : (
            <Tooltip title={blocked ?? ""}>
              <span>
                <Button variant="contained" endIcon={<ChevronRightIcon />} disabled={!!blocked} onClick={() => onStepChange(step + 1)}>
                  Next
                </Button>
              </span>
            </Tooltip>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}

/** Small green/grey line used by review checklists. */
export function CheckLine({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={1} alignItems="flex-start">
      {ok
        ? <CheckIcon sx={{ fontSize: 18, color: "success.main", mt: "1px" }} />
        : <ErrorOutlineIcon sx={{ fontSize: 18, color: "warning.main", mt: "1px" }} />}
      <Typography variant="body2" color={ok ? "text.primary" : "text.secondary"}>{children}</Typography>
    </Stack>
  );
}
