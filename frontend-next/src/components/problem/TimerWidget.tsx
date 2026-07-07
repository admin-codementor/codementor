"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Popover from "@mui/material/Popover";
import Chip from "@mui/material/Chip";
import { keyframes } from "@emotion/react";
import { TimerOutlinedIcon, HourglassEmptyOutlinedIcon, PlayArrowOutlinedIcon, PauseOutlinedIcon, RestartAltOutlinedIcon } from "@/components/ui/icons";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { useToast } from "@/components/feedback/ToastProvider";

const lsTimer = (pid: string) => `cm:timer:${pid}`;
const POMODORO_PRESETS = [5, 15, 25] as const;

function fmt(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// Subtle pulse for the final Pomodoro seconds. The global prefers-reduced-motion
// override neutralises the animation.
const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
`;

type Mode = "session" | "focus";

/**
 * Combined problem timer. Shows exactly ONE readout at a time (Von Restorff):
 * - **Session** (default): auto-accumulating *active* time — pauses when the tab is
 *   hidden and when the problem is solved; persisted per-problem in localStorage.
 * - **Focus** (Pomodoro): a user-controlled countdown with presets + start/pause/reset.
 * The header chip shows the selected mode; clicking it opens a popover to switch modes
 * and control the Pomodoro.
 */
export function TimerWidget({ problemId, solved }: { problemId: string; solved: boolean }) {
  const showToast = useToast();
  const [mode, setMode] = React.useState<Mode>("session");
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);

  // ── Session timer (auto, active-time only) ──
  const [sessionSecs, setSessionSecs] = React.useState(() => {
    if (typeof window === "undefined") return 0;
    return parseInt(localStorage.getItem(lsTimer(problemId)) ?? "0", 10);
  });
  const sessionRef = React.useRef(sessionSecs);
  React.useEffect(() => {
    sessionRef.current = sessionSecs;
  }, [sessionSecs]);

  // Reset when navigating to a different problem (component is reused across params).
  React.useEffect(() => {
    setSessionSecs(parseInt(localStorage.getItem(lsTimer(problemId)) ?? "0", 10));
  }, [problemId]);

  React.useEffect(() => {
    if (solved) return; // stop counting once accepted (Peak-End)
    const tick = setInterval(() => {
      if (document.hidden) return; // count active time only
      setSessionSecs((s) => {
        const next = s + 1;
        if (next % 15 === 0) localStorage.setItem(lsTimer(problemId), String(next));
        return next;
      });
    }, 1000);
    return () => {
      clearInterval(tick);
      localStorage.setItem(lsTimer(problemId), String(sessionRef.current));
    };
  }, [problemId, solved]);

  // ── Pomodoro (focus) ──
  const [pomoTotal, setPomoTotal] = React.useState(25 * 60);
  const [pomoLeft, setPomoLeft] = React.useState(25 * 60);
  const [pomoRunning, setPomoRunning] = React.useState(false);

  React.useEffect(() => {
    if (!pomoRunning) return;
    const tick = setInterval(() => {
      setPomoLeft((s) => {
        if (s <= 1) {
          setPomoRunning(false);
          showToast("Focus session complete — take a short break!", { severity: "success" });
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [pomoRunning, showToast]);

  const setPreset = (mins: number) => {
    setPomoRunning(false);
    setPomoTotal(mins * 60);
    setPomoLeft(mins * 60);
  };
  const resetPomo = () => {
    setPomoRunning(false);
    setPomoLeft(pomoTotal);
  };
  const pomoDone = pomoLeft === 0;

  // ── Header chip: shows the selected mode's readout only ──
  const focusMode = mode === "focus";
  const display = focusMode ? fmt(pomoLeft) : fmt(sessionSecs);
  const chipActive = focusMode && pomoRunning;
  const chipLow = focusMode && pomoRunning && pomoLeft <= 10;

  return (
    <>
      <Chip
        icon={focusMode ? <HourglassEmptyOutlinedIcon sx={{ fontSize: 16 }} /> : <TimerOutlinedIcon sx={{ fontSize: 16 }} />}
        label={display}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        variant="outlined"
        size="small"
        aria-label={`${focusMode ? "Focus" : "Session"} timer ${display}. Open timer options`}
        sx={{
          fontFamily: "ui-monospace, monospace",
          fontWeight: 600,
          borderColor: chipActive ? "var(--mui-palette-ai)" : "outlineVariant",
          color: chipActive ? "var(--mui-palette-ai)" : "text.secondary",
          "& .MuiChip-icon": { color: chipActive ? "var(--mui-palette-ai)" : "text.secondary" },
          ...(chipLow ? { animation: `${pulse} 1s infinite ease-in-out` } : {}),
        }}
      />

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { p: 2, width: 268, border: "1px solid", borderColor: "outlineVariant" } } }}
      >
        <SegmentedButtons<Mode>
          value={mode}
          onChange={setMode}
          segments={[
            { value: "session", label: "Session" },
            { value: "focus", label: "Focus" },
          ]}
          ariaLabel="Timer mode"
        />

        {mode === "session" ? (
          <Box sx={{ mt: 2, textAlign: "center" }}>
            <Typography variant="h4" sx={{ fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>
              {fmt(sessionSecs)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              Auto-tracked active time. Pauses when you leave the tab or solve the problem.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ mt: 2 }}>
            <Typography
              variant="h4"
              sx={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, textAlign: "center", color: pomoDone ? "success.main" : "text.primary" }}
            >
              {fmt(pomoLeft)}
            </Typography>
            <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 1.5 }}>
              {POMODORO_PRESETS.map((m) => (
                <Chip
                  key={m}
                  label={`${m}m`}
                  size="small"
                  onClick={() => setPreset(m)}
                  variant={pomoTotal === m * 60 ? "filled" : "outlined"}
                  sx={{
                    fontWeight: 600,
                    bgcolor: pomoTotal === m * 60 ? "secondaryContainer" : "transparent",
                    color: pomoTotal === m * 60 ? "onSecondaryContainer" : "text.secondary",
                    borderColor: "outlineVariant",
                  }}
                />
              ))}
            </Stack>
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <Button
                fullWidth
                variant="contained"
                size="small"
                startIcon={pomoRunning ? <PauseOutlinedIcon /> : <PlayArrowOutlinedIcon />}
                onClick={() => setPomoRunning((r) => !r)}
                disabled={pomoDone}
              >
                {pomoRunning ? "Pause" : pomoLeft < pomoTotal ? "Resume" : "Start"}
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={resetPomo}
                aria-label="Reset focus timer"
                sx={{ minWidth: 44, px: 0 }}
              >
                <RestartAltOutlinedIcon fontSize="small" />
              </Button>
            </Stack>
          </Box>
        )}
      </Popover>
    </>
  );
}
