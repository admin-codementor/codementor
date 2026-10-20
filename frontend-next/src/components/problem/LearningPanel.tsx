"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import { TipsAndUpdatesOutlinedIcon, LockOutlinedIcon, CheckCircleOutlineIcon } from "@/components/ui/icons";
import type { ProblemLearning } from "@/lib/types";

const lsHints = (pid: string) => `cm:hints:${pid}`;

function readShown(pid: string): number {
  try {
    return Math.max(0, Number(localStorage.getItem(lsHints(pid))) || 0);
  } catch {
    return 0;
  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="subtitle2"
      sx={{ mb: 1, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "text.secondary" }}
    >
      {children}
    </Typography>
  );
}

/**
 * The teaching side of a problem: the goal, hints revealed one at a time, and (once the student has solved it)
 * the reference solution with its time and space complexity. The answer never reaches the browser before it
 * is earned — the server only sends it to a student with an accepted submission.
 */
export function LearningPanel({ problemId, learning, loading }: { problemId: string; learning: ProblemLearning | null; loading: boolean }) {
  // Reveal progress is remembered per problem, so a refresh does not hide hints already opened.
  // The page mounts this with key={problemId}, so each problem starts from its own saved value.
  const [shown, setShown] = React.useState(() => readShown(problemId));

  const reveal = (n: number) => {
    setShown(n);
    try {
      localStorage.setItem(lsHints(problemId), String(n));
    } catch {
      /* private mode: the reveal still works for this visit */
    }
  };

  if (loading && !learning) {
    return (
      <Stack spacing={1.5}>
        <Skeleton height={64} sx={{ borderRadius: 2 }} />
        <Skeleton height={64} sx={{ borderRadius: 2 }} />
      </Stack>
    );
  }
  if (!learning) {
    return (
      <Typography color="text.secondary" variant="body2" sx={{ py: 6, textAlign: "center" }}>
        Hints could not be loaded. Try again in a moment.
      </Typography>
    );
  }

  const total = learning.hints.length;
  const visible = Math.min(shown, total);

  return (
    <Stack spacing={3}>
      {learning.objective && (
        <Box>
          <SectionLabel>Goal</SectionLabel>
          <Typography variant="body2" sx={{ lineHeight: 1.7 }}>{learning.objective}</Typography>
        </Box>
      )}

      {total > 0 && (
        <Box>
          <SectionLabel>Hints</SectionLabel>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            Give it a real try first. Each hint is a little more specific than the last.
          </Typography>
          <Stack spacing={1.25}>
            {learning.hints.slice(0, visible).map((h, i) => (
              <Box
                key={i}
                sx={{ p: 1.75, borderRadius: 1.5, bgcolor: "surfaceContainerHigh", border: "1px solid", borderColor: "outlineVariant" }}
              >
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Hint {i + 1} of {total}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5, lineHeight: 1.7 }}>{h}</Typography>
              </Box>
            ))}
          </Stack>
          {visible < total && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<TipsAndUpdatesOutlinedIcon fontSize="small" />}
              onClick={() => reveal(visible + 1)}
              sx={{ mt: 1.5 }}
            >
              {visible === 0 ? "Show the first hint" : `Show hint ${visible + 1} of ${total}`}
            </Button>
          )}
        </Box>
      )}

      {(learning.has_solution || learning.has_complexity) && (
        <Box>
          <SectionLabel>Reference solution and analysis</SectionLabel>
          {learning.unlocked ? (
            <Stack spacing={1.5}>
              {learning.solved && (
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <CheckCircleOutlineIcon fontSize="small" color="success" />
                  <Typography variant="caption" color="success.main" fontWeight={600}>You solved this one</Typography>
                </Stack>
              )}
              {learning.complexity && (
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                  {learning.complexity.time && (
                    <Box sx={{ px: 1.25, py: 0.625, borderRadius: 1.5, bgcolor: "surfaceContainerHigh" }}>
                      <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Time</Typography>
                      <Typography variant="caption" fontWeight={700}>{learning.complexity.time}</Typography>
                    </Box>
                  )}
                  {learning.complexity.space && (
                    <Box sx={{ px: 1.25, py: 0.625, borderRadius: 1.5, bgcolor: "surfaceContainerHigh" }}>
                      <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Space</Typography>
                      <Typography variant="caption" fontWeight={700}>{learning.complexity.space}</Typography>
                    </Box>
                  )}
                </Stack>
              )}
              {learning.reference_solution && (
                <Box
                  component="pre"
                  tabIndex={0}
                  aria-label="Reference solution"
                  sx={{
                    m: 0, p: 1.75, bgcolor: "surfaceContainerHighest", borderRadius: 1.5,
                    fontFamily: "ui-monospace, monospace", typography: "body2", lineHeight: 1.6, overflow: "auto",
                  }}
                >
                  {learning.reference_solution}
                </Box>
              )}
            </Stack>
          ) : (
            <Stack direction="row" spacing={1.25} alignItems="flex-start" sx={{ p: 1.75, borderRadius: 1.5, bgcolor: "surfaceContainerLow", border: "1px dashed", borderColor: "outlineVariant" }}>
              <LockOutlinedIcon fontSize="small" sx={{ color: "text.secondary", mt: 0.25 }} />
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                Solve this problem to unlock the reference solution and its time and space complexity.
              </Typography>
            </Stack>
          )}
        </Box>
      )}
    </Stack>
  );
}
