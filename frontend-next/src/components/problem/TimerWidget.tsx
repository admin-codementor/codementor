"use client";

import * as React from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Popover from "@mui/material/Popover";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import TextField from "@mui/material/TextField";
import { keyframes } from "@emotion/react";
import { TimerOutlinedIcon, HourglassEmptyOutlinedIcon, PlayArrowOutlinedIcon, PauseOutlinedIcon, RestartAltOutlinedIcon, CheckCircleOutlineIcon } from "@/components/ui/icons";
import { useToast } from "@/components/feedback/ToastProvider";
import api from "@/lib/api";
import type { ProblemTime } from "@/lib/types";

const lsTimer = (pid: string) => `cm:timer:${pid}`;
const POMODORO_PRESETS = [5, 15, 25] as const;
const FLUSH_EVERY_MS = 60_000;
// Fewer than this many unsent seconds is not worth a write (every tab switch would otherwise cost one); the
// browser keeps them and they go with the next flush.
const MIN_FLUSH_SECONDS = 15;
const MAX_PER_CALL = 600;

function fmt(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

const readLocal = (pid: string) => {
  try {
    return Math.max(0, parseInt(localStorage.getItem(lsTimer(pid)) ?? "0", 10) || 0);
  } catch {
    return 0;
  }
};
const writeLocal = (pid: string, secs: number) => {
  try {
    localStorage.setItem(lsTimer(pid), String(secs));
  } catch {
    /* private mode: the server copy still keeps the time */
  }
};

// Subtle pulse for the final seconds of the personal timer. The global prefers-reduced-motion
// override neutralises the animation.
const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
`;

/**
 * Two clocks side by side in the problem header.
 *
 * 1. **Time on this problem** — automatic. Counts active time only: it pauses when the tab is hidden, when the
 *    student leaves the problem, and when the problem is solved, and carries on from the same value next time.
 *    The total is saved on the server (about once a minute and whenever the student pauses or leaves), so it follows
 *    them to another device; the browser keeps a copy so nothing is lost if the connection drops.
 * 2. **My timer** — the student's own countdown (5/15/25 minutes or any length) for working in focused blocks.
 */
export function TimerWidget({
  problemId,
  solved,
  prominent = false,
}: {
  problemId: string;
  solved: boolean;
  /**
   * Under proctoring the clock is the most important thing in the header, so it
   * gets real weight. In ordinary practice it stays a quiet chip — a stopwatch
   * counting up while someone is thinking is pressure they didn't ask for.
   */
  prominent?: boolean;
}) {
  const showToast = useToast();
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);

  // ── Time on this problem (automatic, saved on the server) ──
  // The page mounts this with key={problemId}, so every problem starts from its own saved value.
  const [secs, setSecs] = React.useState(() => readLocal(problemId));
  const [solvedAt, setSolvedAt] = React.useState<number | null>(null);
  const secsRef = React.useRef(secs);
  const syncedRef = React.useRef(0); // the part the server already has
  const loadedRef = React.useRef(false); // never send before we know what the server has
  const solvedRef = React.useRef(solved);
  const sendingRef = React.useRef(false);
  const pidRef = React.useRef(problemId);

  const flush = React.useCallback(async () => {
    if (!loadedRef.current || sendingRef.current) return;
    const delta = secsRef.current - syncedRef.current;
    const mustRecordSolve = solvedRef.current && solvedAt === null;
    if (!mustRecordSolve && delta < MIN_FLUSH_SECONDS) return;
    sendingRef.current = true;
    const pid = pidRef.current;
    const send = Math.max(1, Math.min(delta, MAX_PER_CALL));
    try {
      // The course the student came from (the problem page link carries it) feeds the faculty activity report.
      const courseId = new URLSearchParams(window.location.search).get("course");
      const res = await api.post<{ success: boolean; data: ProblemTime }>(`/api/student/problems/${pid}/time`, { seconds: send, solved: solvedRef.current, ...(courseId ? { course_id: courseId } : {}) });
      if (pidRef.current === pid) {
        syncedRef.current += delta < 1 ? 0 : send;
        setSolvedAt(res.data.data.solvedAtSeconds);
      }
    } catch {
      /* offline or a hiccup: the unsent seconds stay counted and go with the next flush */
    } finally {
      sendingRef.current = false;
    }
  }, [solvedAt]);
  const flushRef = React.useRef(flush);
  React.useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // Load this problem's saved time: the larger of this browser's copy and the server's, so progress is never lost
  // and a second device continues from the same point.
  React.useEffect(() => {
    pidRef.current = problemId;
    loadedRef.current = false;
    const local = readLocal(problemId);
    secsRef.current = Math.max(secsRef.current, local);
    syncedRef.current = 0;
    let active = true;
    api
      .get<{ success: boolean; data: ProblemTime }>(`/api/student/problems/${problemId}/time`)
      .then((res) => {
        if (!active) return;
        const server = res.data.data.seconds;
        syncedRef.current = server;
        loadedRef.current = true;
        const merged = Math.max(local, server, secsRef.current);
        secsRef.current = merged;
        setSecs(merged);
        setSolvedAt(res.data.data.solvedAtSeconds);
      })
      .catch(() => {
        /* offline: keep counting locally, sync is retried by the next page visit */
      });
    return () => {
      active = false;
      writeLocal(problemId, secsRef.current);
      flushRef.current(); // leaving the problem: save what has not been sent yet
    };
  }, [problemId]);

  React.useEffect(() => {
    solvedRef.current = solved;
    if (solved) flushRef.current(); // record the time-to-solve straight away
  }, [solved]);

  React.useEffect(() => {
    if (solved) return; // stop counting once accepted (Peak-End)
    const tick = setInterval(() => {
      if (document.hidden) return; // count active time only
      secsRef.current += 1;
      setSecs(secsRef.current);
      if (secsRef.current % 5 === 0) writeLocal(problemId, secsRef.current);
    }, 1000);
    const save = setInterval(() => flushRef.current(), FLUSH_EVERY_MS);
    const onHide = () => {
      if (document.hidden) {
        writeLocal(problemId, secsRef.current);
        flushRef.current();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(tick);
      clearInterval(save);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [problemId, solved]);

  // ── My timer (student-controlled countdown) ──
  const [pomoTotal, setPomoTotal] = React.useState(25 * 60);
  const [pomoLeft, setPomoLeft] = React.useState(25 * 60);
  const [pomoRunning, setPomoRunning] = React.useState(false);
  const [pomoUsed, setPomoUsed] = React.useState(false); // show the chip once the student has touched it
  const [customMins, setCustomMins] = React.useState("");

  React.useEffect(() => {
    if (!pomoRunning) return;
    const tick = setInterval(() => {
      setPomoLeft((s) => {
        if (s <= 1) {
          setPomoRunning(false);
          showToast("Your timer is up. Take a short break, then look at the problem again.", { severity: "success" });
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [pomoRunning, showToast]);

  const setMinutes = (mins: number) => {
    const m = Math.min(180, Math.max(1, Math.round(mins)));
    setPomoRunning(false);
    setPomoTotal(m * 60);
    setPomoLeft(m * 60);
    setPomoUsed(true);
  };
  const resetPomo = () => {
    setPomoRunning(false);
    setPomoLeft(pomoTotal);
  };
  const pomoDone = pomoLeft === 0;
  const pomoLow = pomoRunning && pomoLeft <= 10;

  const chipBase = {
    fontFamily: "ui-monospace, monospace",
    fontWeight: prominent ? 700 : 600,
    ...(prominent ? { height: 34, fontSize: "1rem", letterSpacing: "0.02em" } : {}),
  } as const;

  return (
    <>
      <Stack direction="row" spacing={0.75} alignItems="center">
        <Chip
          icon={solved ? <CheckCircleOutlineIcon sx={{ fontSize: 16 }} /> : <TimerOutlinedIcon sx={{ fontSize: 16 }} />}
          label={fmt(secs)}
          onClick={(e) => setAnchorEl(e.currentTarget)}
          variant="outlined"
          size="small"
          title="Time spent on this problem"
          aria-label={`Time spent on this problem ${fmt(secs)}. Open timer options`}
          sx={{
            ...chipBase,
            ...(prominent
              ? { bgcolor: "warningContainer", color: "onWarningContainer", borderColor: "warning.main", "& .MuiChip-icon": { color: "onWarningContainer" } }
              : { borderColor: "outlineVariant", color: solved ? "success.main" : "text.secondary", "& .MuiChip-icon": { color: solved ? "success.main" : "text.secondary" } }),
          }}
        />
        <Chip
          icon={<HourglassEmptyOutlinedIcon sx={{ fontSize: 16 }} />}
          label={pomoUsed ? fmt(pomoLeft) : "Timer"}
          onClick={(e) => setAnchorEl(e.currentTarget)}
          variant="outlined"
          size="small"
          title="Your own countdown timer"
          aria-label={pomoUsed ? `My timer ${fmt(pomoLeft)}. Open timer options` : "Set my own timer"}
          sx={{
            ...chipBase,
            borderColor: pomoRunning ? "var(--mui-palette-ai)" : "outlineVariant",
            color: pomoRunning ? "var(--mui-palette-ai)" : "text.secondary",
            "& .MuiChip-icon": { color: pomoRunning ? "var(--mui-palette-ai)" : "text.secondary" },
            ...(pomoLow ? { animation: `${pulse} 1s infinite ease-in-out` } : {}),
          }}
        />
      </Stack>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { p: 2, width: 292, border: "1px solid", borderColor: "outlineVariant" } } }}
      >
        <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Time on this problem
        </Typography>
        <Typography variant="h4" sx={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, mt: 0.5 }}>
          {fmt(secs)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          {solved
            ? solvedAt != null
              ? `Solved in ${fmt(solvedAt)}.`
              : "Solved. The clock has stopped."
            : "Counts only while this problem is open and the tab is visible. It stops when you leave and continues from here next time."}
        </Typography>

        <Divider sx={{ my: 2 }} />

        <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
          My timer
        </Typography>
        <Typography
          variant="h4"
          sx={{ fontFamily: "ui-monospace, monospace", fontWeight: 700, mt: 0.5, color: pomoDone ? "success.main" : "text.primary" }}
        >
          {fmt(pomoLeft)}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", gap: 1 }}>
          {POMODORO_PRESETS.map((m) => (
            <Chip
              key={m}
              label={`${m} min`}
              size="small"
              onClick={() => setMinutes(m)}
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
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} alignItems="center">
          <TextField
            size="small"
            type="number"
            label="Minutes"
            value={customMins}
            onChange={(e) => setCustomMins(e.target.value)}
            slotProps={{ htmlInput: { min: 1, max: 180, "aria-label": "Custom timer minutes" } }}
            sx={{ width: 110 }}
          />
          <Button variant="outlined" size="small" disabled={!(Number(customMins) >= 1)} onClick={() => { setMinutes(Number(customMins)); setCustomMins(""); }}>
            Set
          </Button>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button
            fullWidth
            variant="contained"
            size="small"
            startIcon={pomoRunning ? <PauseOutlinedIcon /> : <PlayArrowOutlinedIcon />}
            onClick={() => { setPomoUsed(true); setPomoRunning((r) => !r); }}
            disabled={pomoDone}
          >
            {pomoRunning ? "Pause" : pomoLeft < pomoTotal ? "Resume" : "Start"}
          </Button>
          <Button variant="outlined" size="small" onClick={resetPomo} aria-label="Reset my timer" sx={{ minWidth: 44, px: 0 }}>
            <RestartAltOutlinedIcon fontSize="small" />
          </Button>
        </Stack>
      </Popover>
    </>
  );
}
