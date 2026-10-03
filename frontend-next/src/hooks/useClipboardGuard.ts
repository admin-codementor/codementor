"use client";

import * as React from "react";
import api from "@/lib/api";

/**
 * Blocks copy / cut / paste inside a given element, and records each attempt as
 * a proctor event.
 *
 * Scoped to a container rather than the document on purpose: a document-wide
 * block would also break pasting into the AI tutor chat, the search box and the
 * custom-input field, none of which is the thing we are trying to prevent. The
 * target is the code editor.
 *
 * Applied on the exam and course problem-solving screens, never in the sandbox —
 * the sandbox exists for free experimentation, where pasting your own code is
 * legitimate.
 *
 * This is a deterrent, not a security control: anyone can retype code, use a
 * second device, or disable JavaScript. It raises the effort and leaves a trail,
 * which is all a browser-side check can honestly claim.
 */
export function useClipboardGuard({
  active,
  container,
  examId,
  assignmentId,
  problemId,
}: {
  active: boolean;
  /**
   * The element to guard. Takes the element itself, not a ref: the editor is
   * lazy-loaded, so it does not exist on first render, and a plain ref would
   * never re-run the effect once it appeared. Callers hold it in state via a
   * callback ref.
   */
  container: HTMLElement | null;
  examId?: string | null;
  assignmentId?: string | null;
  problemId?: string | null;
}) {
  const [blocked, setBlocked] = React.useState(0);
  const [notice, setNotice] = React.useState<string | null>(null);
  // Logging every keystroke-fast repeat would flood the events collection; one
  // event per action per second is enough to show a pattern.
  const lastLogged = React.useRef(0);

  const log = React.useCallback(
    (eventType: string, detail?: string) => {
      const now = Date.now();
      if (now - lastLogged.current < 1000) return;
      lastLogged.current = now;
      api
        .post("/api/proctor/event", {
          event_type: eventType,
          assignment_id: assignmentId ?? null,
          exam_id: examId ?? null,
          problem_id: problemId ?? null,
          detail: detail ?? null,
        })
        .catch(() => { /* never let telemetry break the page the student is working in */ });
    },
    [assignmentId, examId, problemId],
  );

  React.useEffect(() => {
    if (!active || !container) return;
    const el = container;

    const block = (e: Event, kind: "paste" | "copy", message: string) => {
      e.preventDefault();
      e.stopPropagation();
      setBlocked((n) => n + 1);
      setNotice(message);
      log(kind, "blocked");
    };

    const onPaste = (e: ClipboardEvent) => {
      const chars = String(e.clipboardData?.getData("text") || "").length;
      block(e, "paste", `Pasting is turned off here. ${chars > 0 ? "Type your solution instead." : ""}`.trim());
    };
    const onCopy = (e: ClipboardEvent) => block(e, "copy", "Copying is turned off during assessed work.");
    const onCut = (e: ClipboardEvent) => block(e, "copy", "Cutting is turned off during assessed work.");
    // Right-click would otherwise offer Paste straight from the context menu.
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    el.addEventListener("paste", onPaste, true);
    el.addEventListener("copy", onCopy, true);
    el.addEventListener("cut", onCut, true);
    el.addEventListener("contextmenu", onContextMenu);
    return () => {
      el.removeEventListener("paste", onPaste, true);
      el.removeEventListener("copy", onCopy, true);
      el.removeEventListener("cut", onCut, true);
      el.removeEventListener("contextmenu", onContextMenu);
    };
  }, [active, container, log]);

  // Clear the banner a few seconds after the last blocked attempt.
  React.useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice, blocked]);

  return { blocked, notice, dismissNotice: () => setNotice(null) };
}
