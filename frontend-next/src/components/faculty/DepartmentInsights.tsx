"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { SectionCard } from "@/components/ui/SectionCard";
import { AutoAwesomeOutlinedIcon, RefreshIcon } from "@/components/ui/icons";
import { radius, typeScale } from "@/theme/tokens";

interface Insight { title: string; detail: string; action: string; priority: "high" | "medium" | "low" }
interface InsightsResult { headline: string; insights: Insight[]; generated_at: string }

const PRIORITY = {
  high: { label: "High", bg: "errorContainer", fg: "onErrorContainer" },
  medium: { label: "Medium", bg: "warningContainer", fg: "onWarningContainer" },
  low: { label: "Low", bg: "surfaceContainerHigh", fg: "onSurfaceVariant" },
} as const;

/**
 * Written recommendations on demand. The server sends the AI provider only
 * totals and percentages, never student names, and caches each result for 10
 * minutes, so pressing the button repeatedly does not spend extra quota.
 */
export function DepartmentInsights({ section, year }: { section: string; year: string }) {
  const m = useMutation<InsightsResult>({
    mutationFn: async () => (await api.post("/api/faculty/department/insights", { section, year })).data.data,
  });

  return (
    <SectionCard
      title="AI insights"
      icon={<AutoAwesomeOutlinedIcon fontSize="small" />}
      action={
        m.data ? (
          <Button size="small" startIcon={<RefreshIcon fontSize="small" />} onClick={() => m.mutate()} disabled={m.isPending}>
            Regenerate
          </Button>
        ) : undefined
      }
    >
      {m.isPending ? (
        <Stack spacing={1.5}>
          <Skeleton variant="rounded" height={28} width="60%" />
          <Skeleton variant="rounded" height={72} />
          <Skeleton variant="rounded" height={72} />
        </Stack>
      ) : m.isError ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => m.mutate()}>Try again</Button>}>
          {apiErrorMessage(m.error, "Could not generate insights.")}
        </Alert>
      ) : m.data ? (
        <Stack spacing={2}>
          {m.data.headline && <Typography variant="subtitle1" fontWeight={600}>{m.data.headline}</Typography>}
          {m.data.insights.length === 0 && (
            <Typography variant="body2" color="text.secondary">Nothing to report for this view yet.</Typography>
          )}
          {m.data.insights.map((i) => {
            const p = PRIORITY[i.priority];
            return (
              <Box key={i.title} sx={{ p: 1.5, border: "1px solid", borderColor: "outlineVariant", borderRadius: radius.md }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Chip size="small" label={p.label} sx={{ height: 20, fontSize: typeScale.labelSmall.fontSize, fontWeight: 600, bgcolor: p.bg, color: p.fg }} />
                  <Typography variant="body2" fontWeight={600}>{i.title}</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">{i.detail}</Typography>
                {i.action && (
                  <Typography variant="body2" sx={{ mt: 0.75 }}>
                    <strong>Next step:</strong> {i.action}
                  </Typography>
                )}
              </Box>
            );
          })}
          <Typography variant="caption" color="text.secondary">
            Generated {new Date(m.data.generated_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}.
            Written by an AI from totals and percentages only — check it against what you know of your students.
          </Typography>
        </Stack>
      ) : (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            Get written, prioritised recommendations for this view. Only totals and percentages are sent to the AI
            provider; no student names or details leave the platform.
          </Typography>
          <Button variant="contained" startIcon={<AutoAwesomeOutlinedIcon fontSize="small" />} onClick={() => m.mutate()}>
            Generate insights
          </Button>
        </Stack>
      )}
    </SectionCard>
  );
}
