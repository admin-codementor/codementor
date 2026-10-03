"use client";

import * as React from "react";
import Box from "@mui/material/Box";

/** KPI strip — 2 columns on phones, then auto-fits evenly. */
export function KpiRow({ children, min = 220 }: { children: React.ReactNode; min?: number }) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: { xs: "1fr 1fr", sm: `repeat(auto-fit, minmax(${min}px, 1fr))` },
        mb: 3,
      }}
    >
      {children}
    </Box>
  );
}

/** Chart row — stacks on small screens, `cols` equal columns from md up. */
export function ChartRow({ children, cols = 2 }: { children: React.ReactNode; cols?: 1 | 2 | 3 }) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: { xs: "1fr", md: `repeat(${cols}, minmax(0, 1fr))` },
        mb: 3,
      }}
    >
      {children}
    </Box>
  );
}
