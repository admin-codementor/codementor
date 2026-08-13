"use client";

import * as React from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import { PolicyOutlinedIcon, ChevronRightIcon, LocalFireDepartmentIcon } from "@/components/ui/icons";
import { ResponsiveBar } from "@nivo/bar";
import { useNivoTheme, useChartColors } from "@/components/ui/nivo";
import Alert from "@mui/material/Alert";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/States";

interface OverviewRow {
  id: string;
  title: string;
  deadline: string;
  pairs: number;
  avgSim: number;
  maxSim: number;
  lastRan: string | null;
}

function simColor(s: number) {
  if (s >= 90) return "error.main";
  if (s >= 75) return "warning.main";
  if (s > 0) return "primary.main";
  return "text.secondary";
}

export default function FacultyPlagiarismOverviewPage() {
  const nivoTheme = useNivoTheme();
  const chartColors = useChartColors();
  const [rows, setRows] = React.useState<OverviewRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    api
      .get("/api/faculty/plagiarism-overview")
      .then((r) => {
        if (r.data?.success) setRows(r.data.data ?? []);
      })
      .catch((e) => setError(apiErrorMessage(e, "Couldn't load the plagiarism overview.")))
      .finally(() => setLoading(false));
  }, []);

  const totalPairs = rows.reduce((s, r) => s + r.pairs, 0);
  const scanned = rows.filter((r) => r.lastRan).length;
  const chartRows = rows.filter((r) => r.lastRan);

  return (
    <Box>
      <PageHeader
        title="Plagiarism"
        subtitle="Run JPlag token/structure-based detection on an assignment's submissions and review similarity analytics."
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Stack spacing={2}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="rounded" height={72} />)}</Stack>
      ) : rows.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState icon={<PolicyOutlinedIcon />} title="No assignments yet" description="Create one to run plagiarism checks." />
        </Card>
      ) : (
        <Stack spacing={3}>
          {scanned > 0 && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 2fr" }, gap: 3 }}>
              <Stack spacing={2}>
                <StatCard icon={<PolicyOutlinedIcon />} label="Flagged pairs (all)" value={totalPairs} accent="error" />
                <StatCard icon={<PolicyOutlinedIcon />} label="Assignments scanned" value={`${scanned}/${rows.length}`} accent="primary" />
              </Stack>
              <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                    <LocalFireDepartmentIcon sx={{ color: "error.main", fontSize: 20 }} />
                    <Typography variant="subtitle2" fontWeight={600}>Flagged pairs by assignment</Typography>
                  </Stack>
                  {chartRows.length === 0 ? (
                    <EmptyState title="No scans yet" />
                  ) : (
                    <Box sx={{ height: 260 }}>
                      <ResponsiveBar
                        data={chartRows.map((r) => ({
                          title: r.title.length > 14 ? r.title.slice(0, 13) + "…" : r.title,
                          "Flagged pairs": r.pairs,
                          "Max similarity %": Math.round(r.maxSim),
                        }))}
                        keys={["Flagged pairs", "Max similarity %"]}
                        indexBy="title"
                        groupMode="grouped"
                        margin={{ top: 16, right: 16, bottom: 56, left: 44 }}
                        padding={0.3}
                        borderRadius={5}
                        colors={[chartColors[0], chartColors[4]]}
                        theme={nivoTheme}
                        enableLabel={false}
                        axisLeft={{ tickSize: 0, tickPadding: 8 }}
                        axisBottom={{ tickSize: 0, tickPadding: 8, tickRotation: -30 }}
                        legends={[{ dataFrom: "keys", anchor: "top-right", direction: "row", translateY: -12, itemWidth: 120, itemHeight: 16, symbolSize: 12, symbolShape: "circle" }]}
                      />
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Box>
          )}

          <Stack spacing={1.5}>
            {rows.map((a) => (
              <Card
                key={a.id}
                variant="outlined"
                component={NextLink}
                href={`/faculty/assignments/${a.id}/plagiarism`}
                sx={{
                  borderColor: "outlineVariant",
                  textDecoration: "none",
                  color: "inherit",
                  transition: "border-color 150ms",
                  "&:hover": { borderColor: "primary.main" },
                }}
              >
                <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, "&:last-child": { pb: 2 } }}>
                  <PolicyOutlinedIcon sx={{ color: "text.secondary", flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={500} noWrap>{a.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {a.lastRan ? `Last scan ${new Date(a.lastRan).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "Not scanned yet"}
                    </Typography>
                  </Box>
                  {a.lastRan && (
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexShrink: 0 }}>
                      <Typography variant="caption" color="text.secondary">{a.pairs} pair{a.pairs === 1 ? "" : "s"}</Typography>
                      {a.pairs > 0 && (
                        <Chip size="small" label={`${a.maxSim.toFixed(0)}% max`} sx={{ height: 22, fontWeight: 700, color: simColor(a.maxSim), bgcolor: "surfaceContainerHigh" }} />
                      )}
                    </Stack>
                  )}
                  <ChevronRightIcon sx={{ color: "text.secondary", flexShrink: 0 }} />
                </CardContent>
              </Card>
            ))}
          </Stack>
        </Stack>
      )}
    </Box>
  );
}
