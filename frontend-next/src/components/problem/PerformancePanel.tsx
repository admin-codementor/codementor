"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import api from "@/lib/api";
import type { ProblemPerformance, PerformanceMetric } from "@/lib/types";

const fmtRuntime = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
const fmtMemory = (kb: number) => (kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`);

const W = 320;
const H = 96;
const PAD_X = 4;

/** Bars = how many other students landed in each range; the highlighted bar is where this student sits. */
function Histogram({ metric, format, label }: { metric: PerformanceMetric; format: (n: number) => string; label: string }) {
  const bins = metric.bins;
  const total = (b: { count: number; mine: boolean }) => b.count + (b.mine ? 1 : 0); // this student is one more in their bin
  const max = Math.max(1, ...bins.map(total));
  const slot = (W - PAD_X * 2) / Math.max(1, bins.length);
  const barW = Math.max(6, slot - 4);
  const first = bins[0];
  const last = bins[bins.length - 1];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
        <Typography variant="caption" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: "0.05em", color: "text.secondary" }}>
          {label}
        </Typography>
        <Typography variant="caption" sx={{ fontFamily: "ui-monospace, monospace" }}>
          you: {metric.mine != null ? format(metric.mine) : "—"}
          {metric.fasterThanPercent != null && ` · faster than ${metric.fasterThanPercent}%`}
        </Typography>
      </Stack>
      <Box component="svg" viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`${label} of other students, with yours highlighted`} sx={{ width: "100%", display: "block" }}>
        <Box component="line" x1={PAD_X} x2={W - PAD_X} y1={H} y2={H} sx={{ stroke: "var(--mui-palette-outlineVariant, #888)", strokeWidth: 1 }} />
        {bins.map((b, i) => {
          const n = total(b);
          if (n === 0) return null;
          const h = Math.max(3, (n / max) * (H - 10));
          const x = PAD_X + i * slot + (slot - barW) / 2;
          return (
            <Box
              component="rect"
              key={i}
              x={x}
              y={H - h}
              width={barW}
              height={h}
              rx={2}
              sx={b.mine ? { fill: "var(--mui-palette-primary-main, #6750a4)" } : { fill: "var(--mui-palette-secondary-main, #888)", opacity: 0.55 }}
            >
              <title>
                {b.mine
                  ? `You (${metric.mine != null ? format(metric.mine) : ""}) and ${b.count} other${b.count === 1 ? "" : "s"}: ${format(b.from)} to ${format(b.to)}`
                  : `${b.count} student${b.count === 1 ? "" : "s"}: ${format(b.from)} to ${format(b.to)}`}
              </title>
            </Box>
          );
        })}
        <Box component="text" x={PAD_X} y={H + 13} fontSize="10" sx={{ fill: "var(--mui-palette-text-secondary, #888)" }}>
          {first ? format(first.from) : ""}
        </Box>
        <Box component="text" x={W - PAD_X} y={H + 13} textAnchor="end" fontSize="10" sx={{ fill: "var(--mui-palette-text-secondary, #888)" }}>
          {last ? format(last.to) : ""}
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Runtime and memory of the student's accepted solution against every other student's, for the same problem and
 * language. Measured by the judge on real runs, never estimated. Shown after an accepted submission.
 */
export function PerformancePanel({ problemId, refreshKey }: { problemId: string; refreshKey?: string | number }) {
  const [data, setData] = React.useState<ProblemPerformance | null>(null);
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");

  React.useEffect(() => {
    let active = true;
    api
      .get<{ success: boolean; data: ProblemPerformance }>(`/api/student/problems/${problemId}/performance`)
      .then((res) => {
        if (!active) return;
        setData(res.data.data);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [problemId, refreshKey]);

  if (state === "loading") return <Skeleton variant="rounded" height={150} />;
  if (state === "error" || !data) {
    return <Typography variant="caption" color="text.secondary">The comparison could not be loaded.</Typography>;
  }
  if (!data.mine) {
    return <Typography variant="caption" color="text.secondary">Get this problem accepted to see how your runtime and memory compare.</Typography>;
  }
  const others = data.runtime.others;
  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="subtitle2" fontWeight={700}>How your solution compares</Typography>
        <Typography variant="caption" color="text.secondary">
          {others === 0
            ? "You are the first student with an accepted solution, so there is nothing to compare against yet."
            : `Against ${others} other student${others === 1 ? "" : "s"}' best accepted run, same language. Measured by the judge, lower is better.`}
        </Typography>
      </Box>
      {others > 0 && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2.5 }}>
          <Histogram metric={data.runtime} format={fmtRuntime} label="Runtime" />
          <Histogram metric={data.memory} format={fmtMemory} label="Memory" />
        </Box>
      )}
      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", gap: 1 }}>
        <Typography variant="caption" color="text.secondary">
          <Box component="span" sx={{ display: "inline-block", width: 10, height: 10, borderRadius: 0.5, bgcolor: "primary.main", mr: 0.75 }} />
          You
        </Typography>
        <Typography variant="caption" color="text.secondary">
          <Box component="span" sx={{ display: "inline-block", width: 10, height: 10, borderRadius: 0.5, bgcolor: "secondary.main", opacity: 0.55, mr: 0.75 }} />
          Other students
        </Typography>
      </Stack>
    </Stack>
  );
}
