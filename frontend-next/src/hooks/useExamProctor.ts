"use client";

import * as React from "react";
import api from "@/lib/api";

interface ExamProctorOptions {
  active: boolean;
  examId: string;
  problemId?: string;
  /** The server paused the attempt (too many violations). */
  onLocked: () => void;
}

/**
 * Exam integrity monitor. It RECORDS leaving fullscreen, switching tab and pasting, and shows ONE calm notice at a time. It never
 * speaks, never counts down and never ends the exam: the server counts the events and, past the exam's limit, pauses the attempt for
 * staff to decide. Only the server deadline ends an exam.
 *
 * (The older useProctor spoke a warning aloud and submitted the exam from the browser after 45 seconds outside fullscreen. That is
 * what made accidental exits end people's exams, and it is not used for exams any more.)
 */
export function useExamProctor({ active, examId, problemId, onLocked }: ExamProctorOptions) {
  const [fullscreen, setFullscreen] = React.useState<boolean>(typeof document !== "undefined" && !!document.fullscreenElement);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [count, setCount] = React.useState(0);
  const [limit, setLimit] = React.useState<number | null>(null);

  const onLockedRef = React.useRef(onLocked);
  React.useEffect(() => { onLockedRef.current = onLocked; }, [onLocked]);
  const noticeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = React.useCallback((text: string | null, clearAfterMs?: number) => {
    if (noticeTimer.current) { clearTimeout(noticeTimer.current); noticeTimer.current = null; }
    setNotice(text);
    if (text && clearAfterMs) noticeTimer.current = setTimeout(() => setNotice(null), clearAfterMs);
  }, []);

  const log = React.useCallback((event_type: string, detail?: string) => {
    api.post("/api/proctor/event", { exam_id: examId, problem_id: problemId, event_type, detail })
      .then((r) => {
        const d = r.data?.data as { locked?: boolean; violation_count?: number; violation_limit?: number } | null | undefined;
        if (!d) return;
        if (typeof d.violation_count === "number") setCount(d.violation_count);
        if (typeof d.violation_limit === "number") setLimit(d.violation_limit);
        if (d.locked) onLockedRef.current();
      })
      .catch(() => { /* recording an event must never get in the student's way */ });
  }, [examId, problemId]);

  const requestFullscreen = React.useCallback(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!active) return;
    log("exam_start");

    const onVis = () => {
      if (document.hidden) {
        log("tab_switch");
      } else {
        say("You left the exam tab. This has been noted.", 8000);
      }
    };
    const onFsChange = () => {
      const fs = !!document.fullscreenElement;
      setFullscreen(fs);
      if (fs) { say(null); return; }
      log("fullscreen_exit");
      say("You left fullscreen. Please return to fullscreen to continue. This has been noted.");
    };
    // Pasting is blocked and recorded: in a live exam it is almost always code or text from somewhere else.
    const onPaste = (e: ClipboardEvent) => { e.preventDefault(); log("paste", `blocked, ${String(e.clipboardData?.getData("text") || "").length} chars`); };
    const onCopy = (e: ClipboardEvent) => { e.preventDefault(); log("copy", "blocked"); };

    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("copy", onCopy, true);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("copy", onCopy, true);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [active, log, say]);

  return { fullscreen, requestFullscreen, notice, dismissNotice: () => say(null), violationCount: count, violationLimit: limit };
}
