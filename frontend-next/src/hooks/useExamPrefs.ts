"use client";

import * as React from "react";

export type ExamLayout = "side" | "stacked";
export interface ExamPrefs {
  /** Question and options side by side, or one above the other. */
  layout: ExamLayout;
  /** Text size of the question area, 50 to 200 percent. */
  fontScale: number;
}

const KEY = "exam-prefs";
export const FONT_STEPS = [50, 75, 100, 125, 150, 175, 200];
const DEFAULTS: ExamPrefs = { layout: "side", fontScale: 100 };

function load(): ExamPrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<ExamPrefs>;
    return {
      layout: p.layout === "stacked" ? "stacked" : "side",
      fontScale: FONT_STEPS.includes(Number(p.fontScale)) ? Number(p.fontScale) : 100,
    };
  } catch {
    return DEFAULTS;
  }
}

/** A student's own display choices for the exam screen (layout and text size), kept on this device. */
export function useExamPrefs() {
  const [prefs, setPrefs] = React.useState<ExamPrefs>(DEFAULTS);
  React.useEffect(() => { setPrefs(load()); }, []);
  const update = React.useCallback((patch: Partial<ExamPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked: the choice lasts until reload */ }
      return next;
    });
  }, []);
  return { prefs, update, reset: () => update({ fontScale: 100 }) };
}
