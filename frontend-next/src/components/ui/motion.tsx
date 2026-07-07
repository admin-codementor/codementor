"use client";

import * as React from "react";
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

/** Cross-fade between drill-down levels, keyed by a changing value. */
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
