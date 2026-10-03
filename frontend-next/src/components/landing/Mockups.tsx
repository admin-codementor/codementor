"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { SmartToyOutlinedIcon, CheckCircleIcon, CancelIcon, TimerOutlinedIcon, WarningAmberIcon } from "@/components/ui/icons";
import { Sparkline } from "@/components/ui/Sparkline";

/**
 * Illustrations for the landing page: stylised, hand-built mock-ups of the
 * product's own screens (not screenshots, so they follow light/dark and never
 * go stale). They are decorative — marked aria-hidden — and use illustrative
 * values only; nothing here claims real usage numbers.
 */

function Window({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box
      aria-hidden
      sx={{
        borderRadius: "16px",
        border: "1px solid var(--mui-palette-outlineVariant)",
        bgcolor: "surfaceContainerLow",
        overflow: "hidden",
        boxShadow: "0 24px 48px -16px color-mix(in srgb, var(--mui-palette-scrim) 28%, transparent)",
      }}
    >
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ px: 2, py: 1.25, bgcolor: "surfaceContainer", borderBottom: "1px solid var(--mui-palette-outlineVariant)" }}>
        {["error", "warning", "success"].map((c) => (
          <Box key={c} sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: `${c}.main`, opacity: 0.7 }} />
        ))}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5 }}>
          {title}
        </Typography>
      </Stack>
      {children}
    </Box>
  );
}

const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 12.5, lineHeight: 1.7 };

export function EditorMock() {
  return (
    <Window title="two-sum.py — Problem 1">
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1.25fr 1fr" } }}>
        <Box sx={{ p: 2, ...mono, bgcolor: "surfaceContainerLowest" }}>
          <Box sx={{ color: "text.secondary" }}># Return indices that add up to target</Box>
          <Box><Box component="span" sx={{ color: "primary.main" }}>def</Box> two_sum(nums, target):</Box>
          <Box sx={{ pl: 2 }}>seen = {"{}"}</Box>
          <Box sx={{ pl: 2 }}><Box component="span" sx={{ color: "primary.main" }}>for</Box> i, n <Box component="span" sx={{ color: "primary.main" }}>in</Box> enumerate(nums):</Box>
          <Box sx={{ pl: 4 }}><Box component="span" sx={{ color: "primary.main" }}>if</Box> target - n <Box component="span" sx={{ color: "primary.main" }}>in</Box> seen:</Box>
          <Box sx={{ pl: 6 }}><Box component="span" sx={{ color: "primary.main" }}>return</Box> [seen[target - n], i]</Box>
          <Box sx={{ pl: 4 }}>seen[n] = i</Box>
        </Box>
        <Stack spacing={1.5} sx={{ p: 2, borderLeft: { sm: "1px solid var(--mui-palette-outlineVariant)" } }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip size="small" icon={<CheckCircleIcon sx={{ fontSize: 14 }} />} label="Accepted" sx={{ bgcolor: "successContainer", color: "onSuccessContainer" }} />
            <Typography variant="caption" color="text.secondary">12 / 12 test cases</Typography>
          </Stack>
          <Box sx={{ p: 1.5, borderRadius: "12px", bgcolor: "aiContainer", color: "onAiContainer" }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <SmartToyOutlinedIcon sx={{ fontSize: 16 }} />
              <Typography variant="caption" fontWeight={700}>AI tutor</Typography>
            </Stack>
            <Typography variant="caption" sx={{ display: "block", lineHeight: 1.5 }}>
              Nice. What is the time complexity if you looked for the complement with a nested loop instead?
            </Typography>
          </Box>
        </Stack>
      </Box>
    </Window>
  );
}

export function AnalyticsMock() {
  const bars = [
    { u: "Basics", s: 82, p: 12 },
    { u: "Loops", s: 64, p: 22 },
    { u: "Arrays", s: 41, p: 30 },
    { u: "Recursion", s: 18, p: 24 },
  ];
  return (
    <Window title="Class analytics — illustrative data">
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5, mb: 2 }}>
          {[
            { l: "Active", v: "86/120", d: [3, 5, 4, 8, 7, 11] },
            { l: "Submissions", v: "412", d: [2, 4, 3, 6, 9, 8] },
            { l: "At risk", v: "9", d: [6, 5, 7, 6, 8, 9] },
          ].map((k) => (
            <Box key={k.l} sx={{ p: 1.5, borderRadius: "12px", border: "1px solid var(--mui-palette-outlineVariant)" }}>
              <Typography variant="overline" color="text.secondary">{k.l}</Typography>
              <Typography variant="h6" fontWeight={600}>{k.v}</Typography>
              <Box sx={{ color: "primary.main" }}><Sparkline data={k.d} width={80} height={20} color="currentColor" /></Box>
            </Box>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary">Where the class is stuck</Typography>
        <Stack spacing={1} sx={{ mt: 1 }}>
          {bars.map((b) => (
            <Stack key={b.u} direction="row" alignItems="center" spacing={1.5}>
              <Typography variant="caption" sx={{ width: 64 }}>{b.u}</Typography>
              <Box sx={{ flex: 1, height: 10, borderRadius: 5, bgcolor: "surfaceContainerHighest", display: "flex", overflow: "hidden" }}>
                <Box sx={{ width: `${b.s}%`, bgcolor: "success.main" }} />
                <Box sx={{ width: `${b.p}%`, bgcolor: "warning.main" }} />
              </Box>
            </Stack>
          ))}
        </Stack>
      </Box>
    </Window>
  );
}

export function ExamMock() {
  return (
    <Window title="Mid-term exam — proctored">
      <Stack spacing={1.5} sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={1} alignItems="center">
            <TimerOutlinedIcon sx={{ fontSize: 18 }} />
            <Typography variant="subtitle2">42:10 remaining</Typography>
          </Stack>
          <Chip size="small" label="Section 2 of 3" />
        </Stack>
        <Stack direction="row" spacing={0.75}>
          {Array.from({ length: 10 }).map((_, i) => (
            <Box key={i} sx={{ width: 26, height: 26, borderRadius: "8px", display: "grid", placeItems: "center", fontSize: 12, bgcolor: i < 5 ? "successContainer" : i === 5 ? "primaryContainer" : "surfaceContainerHighest", color: i < 5 ? "onSuccessContainer" : i === 5 ? "onPrimaryContainer" : "text.secondary" }}>
              {i + 1}
            </Box>
          ))}
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1.25, borderRadius: "12px", bgcolor: "warningContainer", color: "onWarningContainer" }}>
          <WarningAmberIcon sx={{ fontSize: 18 }} />
          <Typography variant="caption">Tab switch detected — logged for your faculty.</Typography>
        </Stack>
      </Stack>
    </Window>
  );
}

export function TestCasesMock() {
  const cases = [
    { n: "Sample 1", ok: true, t: "12 ms" },
    { n: "Sample 2", ok: true, t: "9 ms" },
    { n: "Hidden 1", ok: true, t: "31 ms" },
    { n: "Hidden 2", ok: false, t: "Wrong answer" },
  ];
  return (
    <Window title="Submission result — Problem 7">
      <Stack spacing={1.25} sx={{ p: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip size="small" icon={<WarningAmberIcon sx={{ fontSize: 14 }} />} label="3 / 4 passed" sx={{ bgcolor: "warningContainer", color: "onWarningContainer" }} />
          <Typography variant="caption" color="text.secondary">Hidden case 2 failed</Typography>
        </Stack>
        {cases.map((c) => (
          <Stack key={c.n} direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1.25, borderRadius: "12px", border: "1px solid var(--mui-palette-outlineVariant)" }}>
            <Stack direction="row" spacing={1} alignItems="center">
              {c.ok ? <CheckCircleIcon sx={{ fontSize: 18, color: "success.main" }} /> : <CancelIcon sx={{ fontSize: 18, color: "error.main" }} />}
              <Typography variant="body2">{c.n}</Typography>
            </Stack>
            <Typography variant="caption" color={c.ok ? "text.secondary" : "error.main"}>{c.t}</Typography>
          </Stack>
        ))}
      </Stack>
    </Window>
  );
}
