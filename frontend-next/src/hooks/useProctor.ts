"use client";

import * as React from "react";
import api from "@/lib/api";

interface ProctorOpts {
  active: boolean;
  assignmentId: string | null;
  /** A multi-section Exam this session belongs to, if not an exam assignment. At most one of assignmentId/examId is expected to be set. */
  examId?: string | null;
  problemId?: string;
  onAutoSubmit: () => void;
}

const FULLSCREEN_GRACE_SECONDS = 45;

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  } catch {
    // Best-effort only — some browsers block speech without a prior user gesture.
  }
}

/**
 * Proctored-exam integrity monitor. Enforces fullscreen, records tab switches,
 * fullscreen exits, and paste/copy events to /api/proctor/event. Every
 * fullscreen exit starts a 45-second grace period (spoken + counted down) —
 * returning to fullscreen in time cancels it, letting it run out auto-submits.
 * Client-only (guards `document` for SSR).
 */
export function useProctor({ active, assignmentId, examId, problemId, onAutoSubmit }: ProctorOpts) {
  const [violations, setViolations] = React.useState(0);
  const [warning, setWarning] = React.useState<string | null>(null);
  const [fullscreen, setFullscreen] = React.useState<boolean>(
    typeof document !== "undefined" && !!document.fullscreenElement,
  );
  const [fsGraceSecondsLeft, setFsGraceSecondsLeft] = React.useState<number | null>(null);

  const submitted = React.useRef(false);
  const graceInterval = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const cbRef = React.useRef(onAutoSubmit);
  React.useEffect(() => {
    cbRef.current = onAutoSubmit;
  }, [onAutoSubmit]);

  const log = React.useCallback(
    (event_type: string, detail?: string) => {
      api.post("/api/proctor/event", { assignment_id: assignmentId, exam_id: examId ?? null, problem_id: problemId, event_type, detail }).catch(() => {});
    },
    [assignmentId, examId, problemId],
  );

  const requestFullscreen = React.useCallback(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const clearGrace = React.useCallback(() => {
    if (graceInterval.current != null) {
      clearInterval(graceInterval.current);
      graceInterval.current = null;
    }
    setFsGraceSecondsLeft(null);
  }, []);

  React.useEffect(() => {
    if (!active) return;
    log("exam_start");
    requestFullscreen();

    const onVis = () => {
      if (document.hidden) {
        setViolations((v) => v + 1);
        setWarning("You left the exam tab — this has been recorded.");
        log("tab_switch");
      }
    };
    const onFsChange = () => {
      const fs = !!document.fullscreenElement;
      setFullscreen(fs);
      if (fs) {
        clearGrace();
        return;
      }
      setViolations((v) => v + 1);
      log("fullscreen_exit");
      speak(`Warning. You have left fullscreen. Return within ${FULLSCREEN_GRACE_SECONDS} seconds or your exam will be submitted automatically.`);
      setWarning(`Return to fullscreen within ${FULLSCREEN_GRACE_SECONDS}s or your exam will be auto-submitted.`);
      if (graceInterval.current != null) clearInterval(graceInterval.current);
      setFsGraceSecondsLeft(FULLSCREEN_GRACE_SECONDS);
      graceInterval.current = setInterval(() => {
        setFsGraceSecondsLeft((s) => {
          if (s == null) return s;
          if (s <= 1) {
            if (graceInterval.current != null) {
              clearInterval(graceInterval.current);
              graceInterval.current = null;
            }
            if (!submitted.current) {
              submitted.current = true;
              log("auto_submit");
              cbRef.current();
            }
            return null;
          }
          return s - 1;
        });
      }, 1000);
    };
    const onPaste = (e: ClipboardEvent) => {
      setViolations((v) => v + 1);
      log("paste", `${String(e.clipboardData?.getData("text") || "").length} chars`);
    };
    const onCopy = () => log("copy");

    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("copy", onCopy, true);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("copy", onCopy, true);
      if (graceInterval.current != null) clearInterval(graceInterval.current);
    };
  }, [active, log, requestFullscreen, clearGrace]);

  return { violations, warning, fullscreen, fsGraceSecondsLeft, requestFullscreen, dismissWarning: () => setWarning(null) };
}
