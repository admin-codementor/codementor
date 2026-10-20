"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import LinearProgress from "@mui/material/LinearProgress";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { FlagChip, FormulaDialog, FLAG_STYLE, type Flag, type ScoreFormula, type Thresholds } from "@/components/faculty/CodingScoreTab";

interface Mine {
  points: Record<string, number>; overall: number; flag: Flag; flags: Record<string, Flag>; linked: string[];
  thresholds: Thresholds; formula: ScoreFormula; codementorSolved: number;
}

const LABEL: Record<string, string> = { codementor: "CodeMentor", leetcode: "LeetCode", codeforces: "Codeforces", github: "GitHub" };
const HINT: Record<string, string> = {
  codementor: "Solve problems here.",
  leetcode: "Add your LeetCode username below.",
  codeforces: "Add your Codeforces handle below.",
  github: "Add your GitHub username below.",
};

/** The student's own coding score: one number, the four parts behind it, and how it is worked out. */
export function CodingScoreCard() {
  const [formula, setFormula] = React.useState(false);
  const q = useQuery<Mine>({ queryKey: ["my-coding-score"], queryFn: async () => (await api.get<{ success: boolean; data: Mine }>("/api/profiles/score")).data.data, staleTime: 60_000 });
  if (q.isLoading) return <Skeleton variant="rounded" height={190} sx={{ mb: 3 }} />;
  if (q.isError || !q.data) return null;
  const d = q.data;
  return (
    <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: 2.5, mb: 3 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2.5} alignItems={{ sm: "center" }}>
        <Box sx={{ minWidth: 150 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Your coding score</Typography>
          <Stack direction="row" spacing={1.25} alignItems="baseline">
            <Typography variant="h3" fontWeight={700} sx={{ lineHeight: 1.1 }}>{d.overall}</Typography>
            <Typography variant="body2" color="text.secondary">/ 100</Typography>
          </Stack>
          <Box sx={{ mt: 0.75 }}><FlagChip flag={d.flag} /></Box>
        </Box>
        <Stack spacing={1.25} sx={{ flex: 1, minWidth: 0 }}>
          {Object.keys(LABEL).map((p) => {
            const linked = p === "codementor" || d.linked.includes(p);
            return (
              <Stack key={p} direction="row" spacing={1.5} alignItems="center">
                <Typography variant="body2" sx={{ width: 96, flexShrink: 0 }}>{LABEL[p]}</Typography>
                <LinearProgress
                  variant="determinate" value={linked ? d.points[p] : 0} aria-label={`${LABEL[p]}: ${d.points[p]} of 100`}
                  sx={{ flex: 1, height: 8, borderRadius: 4, "& .MuiLinearProgress-bar": { bgcolor: linked ? `var(--mui-palette-${FLAG_STYLE[d.flags[p]].fg})` : "transparent" } }}
                />
                <Typography variant="caption" sx={{ width: 90, textAlign: "right", fontFamily: "ui-monospace, monospace", color: linked ? "text.primary" : "text.disabled" }}>
                  {linked ? d.points[p] : HINT[p].split(".")[0].replace("Add your ", "link ").replace(" below", "")}
                </Typography>
              </Stack>
            );
          })}
        </Stack>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          Red below {d.thresholds.red}, green from {d.thresholds.green}. Each platform counts for up to 100, so linking more of them raises your score.
        </Typography>
        <Button size="small" onClick={() => setFormula(true)}>How it works</Button>
      </Stack>
      <FormulaDialog open={formula} onClose={() => setFormula(false)} formula={d.formula} />
    </Card>
  );
}
