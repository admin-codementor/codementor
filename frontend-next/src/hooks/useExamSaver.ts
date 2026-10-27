"use client";

import * as React from "react";
import api from "@/lib/api";
import { examHeaders, examStopCode, getExamSession, nextExamSeq, type ExamStopCode } from "@/lib/examSession";

export type SaveStatus = "idle" | "saving" | "saved" | "retrying";

interface PendingSave {
  questionId: string;
  sectionId: string;
  selectedIndex: number | null;
  marked: boolean;
  seq: number;
}

const storeKey = (examId: string) => `exam-pending:${examId}`;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 10000];
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const httpStatus = (e: unknown) => (e as { response?: { status?: number } })?.response?.status;

/**
 * Saves a student's answers so that nothing is lost when the connection is.
 *
 *   - Each save goes into a queue (the latest answer to a question wins) and is also kept on the device, so a dropped connection, a
 *     closed tab or a crash does not lose it: it is sent again as soon as the page is back.
 *   - A failed send (network, server busy) is retried with growing waits. It never shows an error, only "Saving..." and a small
 *     "waiting for connection" state, because the answer is safe.
 *   - Every save carries a number that rises with each save from this tab; the server ignores a late copy of an older save.
 *   - If the server says this tab may no longer write (the exam was opened in another window, the attempt is paused, time is up, it
 *     was submitted), the queue stops and `onStop` says why. Those answers are NOT retried: they would be refused again.
 */
export function useExamSaver({ examId, enabled, onStop }: { examId: string; enabled: boolean; onStop: (code: ExamStopCode) => void }) {
  const [status, setStatus] = React.useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const [pendingCount, setPendingCount] = React.useState(0);

  const pending = React.useRef(new Map<string, PendingSave>());
  const running = React.useRef(false);
  const stopped = React.useRef(false);
  const onStopRef = React.useRef(onStop);
  React.useEffect(() => { onStopRef.current = onStop; }, [onStop]);

  const persist = React.useCallback(() => {
    try {
      if (pending.current.size === 0) window.localStorage.removeItem(storeKey(examId));
      else window.localStorage.setItem(storeKey(examId), JSON.stringify({ session: getExamSession(examId), items: [...pending.current.values()] }));
    } catch { /* storage full or blocked: the queue still works in memory */ }
    setPendingCount(pending.current.size);
  }, [examId]);

  const kick = React.useCallback(async () => {
    if (running.current || stopped.current) return;
    running.current = true;
    let failures = 0;
    try {
      while (pending.current.size > 0 && !stopped.current) {
        const item = pending.current.values().next().value as PendingSave;
        setStatus(failures === 0 ? "saving" : "retrying");
        try {
          await api.patch(
            `/api/exams/${examId}/attempt/questions/${item.questionId}`,
            { section_id: item.sectionId, marked: item.marked, seq: item.seq, ...(item.selectedIndex !== null ? { selected_index: item.selectedIndex } : {}) },
            { headers: examHeaders(examId) },
          );
          failures = 0;
          const current = pending.current.get(item.questionId);
          if (current && current.seq === item.seq) pending.current.delete(item.questionId); // a newer save for it stays queued
          setLastSavedAt(new Date());
          persist();
        } catch (e) {
          const code = examStopCode(e);
          if (code) {
            stopped.current = true;
            pending.current.clear();
            persist();
            onStopRef.current(code);
            return;
          }
          const st = httpStatus(e);
          if (st === 400 || st === 404) {
            // The server will never accept this one (a question that no longer exists): drop it rather than retry forever.
            pending.current.delete(item.questionId);
            persist();
            continue;
          }
          setStatus("retrying");
          await sleep(BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)]);
          failures += 1;
        }
      }
      if (!stopped.current) setStatus("saved");
    } finally {
      running.current = false;
    }
  }, [examId, persist]);

  const save = React.useCallback((item: Omit<PendingSave, "seq">) => {
    if (stopped.current) return;
    pending.current.set(item.questionId, { ...item, seq: nextExamSeq(examId) });
    persist();
    void kick();
  }, [examId, persist, kick]);

  /** Waits until everything queued has been sent (or the time runs out). Call before submitting. */
  const flush = React.useCallback(async (timeoutMs = 15000): Promise<boolean> => {
    const until = Date.now() + timeoutMs;
    void kick();
    while ((pending.current.size > 0 || running.current) && !stopped.current && Date.now() < until) await sleep(150);
    return pending.current.size === 0;
  }, [kick]);

  // Answers that were never confirmed when the page was closed or crashed come back from the device and are sent again.
  React.useEffect(() => {
    if (!enabled) return;
    try {
      const raw = window.localStorage.getItem(storeKey(examId));
      if (raw) {
        const saved = JSON.parse(raw) as { session: string | null; items: PendingSave[] };
        if (saved.session && saved.session === getExamSession(examId)) {
          for (const it of saved.items ?? []) if (!pending.current.has(it.questionId)) pending.current.set(it.questionId, it);
          setPendingCount(pending.current.size);
        } else {
          window.localStorage.removeItem(storeKey(examId));
        }
      }
    } catch { /* a corrupt backup is just ignored */ }
    void kick();
  }, [enabled, examId, kick]);

  // Back online, or the tab is visible again: send what is waiting at once instead of waiting out the pause.
  React.useEffect(() => {
    if (!enabled) return;
    const resume = () => { void kick(); };
    const onVisible = () => { if (document.visibilityState === "visible") resume(); };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", onVisible); };
  }, [enabled, kick]);

  // Closing the tab with unsent answers: the browser asks first. (They are also kept on the device.)
  React.useEffect(() => {
    if (!enabled) return;
    const warn = (e: BeforeUnloadEvent) => { if (pending.current.size > 0) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [enabled]);

  return { save, flush, status, lastSavedAt, pendingCount };
}
