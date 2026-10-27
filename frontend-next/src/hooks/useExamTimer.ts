"use client";

import * as React from "react";

export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/**
 * Countdown to the server's deadline.
 *
 * It is seeded once from the server's "seconds remaining" and turns that into a DEADLINE on this device's clock; every tick then reads
 * the clock instead of counting ticks. A browser slows or pauses timers in a background tab, and a counter that subtracts one per tick
 * drifts behind by exactly that much, showing a student more time than they have. Reading the clock cannot drift.
 * (The server still decides when time is up. This is only what the student sees.)
 *
 * `onExpire` fires once, when the countdown reaches zero.
 */
export function useExamTimer({
  initialSeconds, active, onExpire, seedKey,
}: {
  initialSeconds: number;
  active: boolean;
  onExpire: () => void;
  /** When this changes the countdown is seeded again from `initialSeconds` (for example after the student was resumed with extra time). */
  seedKey?: string | null;
}) {
  const [secondsLeft, setSecondsLeft] = React.useState(initialSeconds);
  const deadlineRef = React.useRef<number | null>(null);
  const seededWith = React.useRef<string | null | undefined>(undefined);
  const onExpireRef = React.useRef(onExpire);
  const firedRef = React.useRef(false);

  React.useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  // Seed exactly once, at the moment the timer first becomes active: the caller renders this hook before its data has loaded and only
  // flips `active` when the real server value has arrived.
  React.useEffect(() => {
    if (active && (deadlineRef.current === null || seededWith.current !== seedKey)) {
      deadlineRef.current = Date.now() + initialSeconds * 1000;
      seededWith.current = seedKey;
      firedRef.current = false;
      setSecondsLeft(Math.max(0, initialSeconds));
    }
  }, [active, initialSeconds, seedKey]);

  React.useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (deadlineRef.current === null) return;
      const left = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpireRef.current();
      }
    };
    tick();
    const t = setInterval(tick, 500);
    // A tab that was asleep catches up the moment it wakes, not at the next tick.
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [active]);

  return { secondsLeft, label: mmss(secondsLeft), low: secondsLeft <= 300 };
}
