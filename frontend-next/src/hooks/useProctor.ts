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

const MAX_FS_EXITS = 3;

/**
 * Proctored-exam integrity monitor. Enforces fullscreen, records tab switches,
 * fullscreen exits, and paste/copy events to /api/proctor/event, and auto-submits
 * after too many fullscreen exits. Client-only (guards `document` for SSR).
 */
export function useProctor({ active, assignmentId, examId, problemId, onAutoSubmit }: ProctorOpts) {
  const [violations, setViolations] = React.useState(0);
  const [warning, setWarning] = React.useState<string | null>(null);
  const [fullscreen, setFullscreen] = React.useState<boolean>(
    typeof document !== "undefined" && !!document.fullscreenElement,
  );

  const fsExits = React.useRef(0);
  const submitted = React.useRef(false);
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
      if (!fs) {
        fsExits.current += 1;
        setViolations((v) => v + 1);
        log("fullscreen_exit", `exit #${fsExits.current}`);
        if (fsExits.current >= MAX_FS_EXITS && !submitted.current) {
          submitted.current = true;
          setWarning("Fullscreen exited 3 times — your exam is being submitted automatically.");
          log("auto_submit");
          cbRef.current();
        } else {
          setWarning(`Return to fullscreen to continue the exam (${fsExits.current}/${MAX_FS_EXITS}).`);
        }
      }
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
    };
  }, [active, log, requestFullscreen]);

  return { violations, warning, fullscreen, requestFullscreen, dismissWarning: () => setWarning(null) };
}
