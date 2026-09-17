"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import { motion, useReducedMotion, type Variants } from "framer-motion";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" } },
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.02 } },
};

/** Fade-and-rise a single block on mount. Respects prefers-reduced-motion. */
export function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div initial="hidden" animate="show" variants={fadeUp} transition={{ delay }}>
      {children}
    </motion.div>
  );
}

/** Wrap a list; children wrapped in <RevealItem> animate in with a subtle stagger. */
export function RevealGroup({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div variants={fadeUp} style={style}>
      {children}
    </motion.div>
  );
}

/**
 * Cross-fade between drill-down levels, keyed by a changing value.
 *
 * Deliberately NOT used for route navigation: `key`-ing on a value unmounts and
 * remounts `children`, which is correct for swapping between drill-down levels
 * (cohort → student, tab → tab) but wrong for page navigation — that would tear
 * down and rebuild the whole page (state, effects, in-flight fetches) on every
 * click. For "something is happening" feedback on navigation, use
 * `NavigationProgress` instead, which never touches the page tree.
 */
export function SwapFade({ swapKey, children }: { swapKey: string | number; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div
      key={swapKey}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Slim top-of-page progress bar for route navigation. Driven by `active`
 * (owned by the caller, which watches link clicks + pathname changes) rather
 * than by mounting/unmounting the page — this is a fixed-position overlay that
 * never wraps or remounts `children`.
 */
export function NavigationProgress({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  return (
    <Box
      aria-hidden
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: (t) => t.zIndex.tooltip + 1,
        overflow: "hidden",
        pointerEvents: "none",
        opacity: active ? 1 : 0,
        transition: "opacity 200ms ease",
      }}
    >
      {active && reduce && (
        <Box sx={{ height: "100%", width: "100%", bgcolor: "primary.main" }} />
      )}
      {active && !reduce && (
        <motion.div
          style={{
            height: "100%",
            width: "30%",
            borderRadius: 999,
            background: "var(--mui-palette-primary-main)",
          }}
          initial={{ x: "-100%" }}
          animate={{ x: "350%" }}
          transition={{ duration: 1.1, ease: "easeInOut", repeat: Infinity }}
        />
      )}
    </Box>
  );
}
