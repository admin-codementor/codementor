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
 * Countdown seeded from a server-computed value (an exam attempt's
 * windowExpiresAt), not a static duration — unlike a plain client timer, the
 * clock has to survive a round trip through the coding IDE and back, and a
 * page reload, without resetting or drifting. `onExpire` fires exactly once.
 *
 * Same submitRef-style pattern as the aptitude test's own countdown (avoids
 * re-subscribing the interval every render, and avoids the stale-closure trap
 * of calling a captured `onExpire` from an interval created seconds earlier).
 */
export function useExamTimer({
  initialSeconds, active, onExpire,
}: {
  initialSeconds: number;
  active: boolean;
  onExpire: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = React.useState(initialSeconds);
  const startedRef = React.useRef(false);
  const onExpireRef = React.useRef(onExpire);
  const firedRef = React.useRef(false);

  React.useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

  // Seed exactly once, at the moment the timer first becomes active — not on
  // mount. The caller typically renders this hook before its data has loaded
  // (initialSeconds still 0/placeholder), and only flips `active` once the
  // real server value has arrived; seeding here instead of on mount avoids
  // locking the countdown to that premature placeholder.
  React.useEffect(() => {
    if (active && !startedRef.current) {
      startedRef.current = true;
      setSecondsLeft(initialSeconds);
    }
  }, [active, initialSeconds]);

  React.useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          if (!firedRef.current) {
            firedRef.current = true;
            onExpireRef.current();
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [active]);

  return { secondsLeft, label: mmss(secondsLeft), low: secondsLeft <= 60 };
}
