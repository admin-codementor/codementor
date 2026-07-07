"use client";

import * as React from "react";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Skeleton from "@mui/material/Skeleton";
import { ChevronLeftIcon, RefreshIcon, PolicyOutlinedIcon, LocalFireDepartmentIcon, PeopleOutlineIcon } from "@/components/ui/icons";
import { ResponsiveBar } from "@nivo/bar";
import { useNivoTheme, useChartColors } from "@/components/ui/nivo";
import api from "@/lib/api";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/States";
import { PlagiarismDiffModal } from "@/components/problem/PlagiarismDiffModal";

interface PlagiarismPair {
  id: string;
  similarity: number;
  language: string;
  ran_at: string;
  student_a_name: string;
  student_a_email: string;
  student_b_name: string;
  student_b_email: string;
}
interface StudentStat {
  email: string;
  name: string;
  pairs: number;
  maxSim: number;
}

function simColor(sim: number) {
  return sim >= 90 ? "error.main" : sim >= 75 ? "warning.main" : "primary.main";
}
function severityLabel(sim: number) {
  return sim >= 90 ? "Critical" : sim >= 75 ? "High" : "Moderate";
}
function severityBg(sim: number) {
  return sim >= 90 ? "errorContainer" : sim >= 75 ? "warningContainer" : "surfaceContainerLow";
}

export default function PlagiarismDetailPage() {
  const nivoTheme = useNivoTheme();
  const chartColors = useChartColors();
  const params = useParams<{ id: string }>();
  const assignmentId = params.id;

  const [pairs, setPairs] = React.useState<PlagiarismPair[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notConfigured, setNotConfigured] = React.useState(false);
  const [lastRan, setLastRan] = React.useState<string | null>(null);
  const [diffPairId, setDiffPairId] = React.useState<string | null>(null);

  const fetchResults = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/api/faculty/assignments/${assignmentId}/plagiarism`);
      if (!res.data.success) throw new Error(res.data.error);
      setPairs(res.data.data);
      if (res.data.data.length > 0) setLastRan(res.data.data[0].ran_at);
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err?.response?.data?.error || err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  React.useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const handleRunCheck = async () => {
    setRunning(true);
    setError(null);
    setNotConfigured(false);
    try {
      const res = await api.post(`/api/faculty/assignments/${assignmentId}/plagiarism`);
      if (!res.data.success) throw new Error(res.data.error);
      await fetchResults();
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { error?: string } }; message?: string };
      const status = err?.response?.status;
      const msg = err?.response?.data?.error || err.message || "Check failed";
      if (status === 503) {
        setNotConfigured(true);
        setError(msg);
      } else setError(msg);
    } finally {
      setRunning(false);
    }
  };

  const critical = pairs.filter((p) => p.similarity >= 90).length;
  const high = pairs.filter((p) => p.similarity >= 75 && p.similarity < 90).length;

  const studentStats = React.useMemo<StudentStat[]>(() => {
    const map: Record<string, StudentStat> = {};
    for (const p of pairs) {
      for (const [name, email] of [
        [p.student_a_name, p.student_a_email],
        [p.student_b_name, p.student_b_email],
      ] as const) {
        if (!map[email]) map[email] = { email, name, pairs: 0, maxSim: 0 };
        map[email].pairs += 1;
        map[email].maxSim = Math.max(map[email].maxSim, p.similarity);
      }
    }
    return Object.values(map).sort((a, b) => b.maxSim - a.maxSim || b.pairs - a.pairs);
  }, [pairs]);

  const distribution = React.useMemo(() => {
    const buckets = [
      { range: "70–79%", count: 0 },
      { range: "80–89%", count: 0 },
      { range: "90–100%", count: 0 },
    ];
    for (const p of pairs) {
      if (p.similarity >= 90) buckets[2].count++;
      else if (p.similarity >= 80) buckets[1].count++;
      else buckets[0].count++;
    }
    return buckets;
  }, [pairs]);

  const topStudents = studentStats.slice(0, 8);

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
        <IconButton component={NextLink} href="/faculty/plagiarism" aria-label="Back to plagiarism overview" size="small">
          <ChevronLeftIcon />
        </IconButton>
        <PolicyOutlinedIcon sx={{ color: "primary.main" }} />
        <Typography variant="h4" component="h1" fontWeight={600} sx={{ flex: 1 }}>
          Plagiarism Review
        </Typography>
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={handleRunCheck} disabled={running}>
          {running ? "Running JPlag…" : "Run Plagiarism Check"}
        </Button>
      </Stack>

      {notConfigured && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          JPlag isn&apos;t configured on this server yet (Java + the JPlag JAR). See <code>docs/PLAGIARISM_SETUP.md</code>. Results below are from previous scans, if any.
        </Alert>
      )}
      {error && !notConfigured && (
        <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
      )}

      {loading ? (
        <Stack spacing={2}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="rounded" height={72} />)}</Stack>
      ) : pairs.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState
            icon={<PolicyOutlinedIcon />}
            title="No suspicious pairs found"
            description={lastRan ? "Last scan found nothing above the similarity threshold." : "Run a plagiarism check to analyse submissions."}
          />
        </Card>
      ) : (
        <Stack spacing={3}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
            <StatCard icon={<PolicyOutlinedIcon />} label="Flagged pairs" value={pairs.length} accent="primary" />
            <StatCard icon={<PolicyOutlinedIcon />} label="Critical (≥90%)" value={critical} accent="error" />
            <StatCard icon={<PolicyOutlinedIcon />} label="High (75–89%)" value={high} accent="warning" />
            <StatCard icon={<PeopleOutlineIcon />} label="Students involved" value={studentStats.length} accent="tertiary" />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
            Last scan: <Box component="span" sx={{ color: "text.primary" }}>{lastRan ? new Date(lastRan).toLocaleString() : "Never"}</Box>
          </Typography>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "2fr 1fr" }, gap: 3 }}>
            <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <LocalFireDepartmentIcon sx={{ color: "error.main", fontSize: 20 }} />
                  <Typography variant="subtitle2" fontWeight={600}>Most-flagged students</Typography>
                </Stack>
                <Box sx={{ height: Math.max(220, topStudents.length * 42) }}>
                  <ResponsiveBar
                    data={topStudents.map((s) => ({ name: s.name.length > 14 ? s.name.slice(0, 13) + "…" : s.name, "Flagged pairs": s.pairs }))}
                    keys={["Flagged pairs"]}
                    indexBy="name"
                    layout="horizontal"
                    margin={{ top: 8, right: 16, bottom: 28, left: 108 }}
                    padding={0.3}
                    borderRadius={5}
                    colors={[chartColors[4]]}
                    theme={nivoTheme}
                    enableLabel={false}
                    axisBottom={{ tickSize: 0, tickPadding: 8 }}
                    axisLeft={{ tickSize: 0, tickPadding: 8 }}
                  />
                </Box>
              </CardContent>
            </Card>
            <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>Similarity distribution</Typography>
                <Box sx={{ height: 240 }}>
                  <ResponsiveBar
                    data={distribution.map((d) => ({ range: d.range, Pairs: d.count }))}
                    keys={["Pairs"]}
                    indexBy="range"
                    margin={{ top: 16, right: 16, bottom: 40, left: 44 }}
                    padding={0.35}
                    borderRadius={5}
                    colors={[chartColors[0]]}
                    theme={nivoTheme}
                    enableLabel={false}
                    axisLeft={{ tickSize: 0, tickPadding: 8 }}
                    axisBottom={{ tickSize: 0, tickPadding: 8 }}
                  />
                </Box>
              </CardContent>
            </Card>
          </Box>

          {/* Per-student risk */}
          <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <PeopleOutlineIcon sx={{ color: "primary.main", fontSize: 20 }} />
                <Typography variant="subtitle2" fontWeight={600}>Per-student risk</Typography>
              </Stack>
              <Stack spacing={1}>
                {studentStats.map((s) => (
                  <Stack key={s.email} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1, borderRadius: 2, border: "1px solid", borderColor: "outlineVariant" }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={500} noWrap>{s.name}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>{s.email}</Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">{s.pairs} pair{s.pairs === 1 ? "" : "s"}</Typography>
                    <Chip size="small" label={`${s.maxSim.toFixed(0)}% max`} sx={{ height: 22, fontWeight: 700, color: simColor(s.maxSim), bgcolor: "surfaceContainerHigh" }} />
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>

          {/* Flagged pairs */}
          <Box>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>Flagged pairs</Typography>
            <Stack spacing={1.5}>
              {pairs.map((pair) => (
                <Card key={pair.id} variant="outlined" sx={{ borderColor: pair.similarity >= 75 ? simColor(pair.similarity) : "outlineVariant", bgcolor: severityBg(pair.similarity) }}>
                  <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, "&:last-child": { pb: 2 } }}>
                    <Box sx={{ width: 72, textAlign: "center", flexShrink: 0 }}>
                      <Typography variant="h5" fontWeight={700} sx={{ color: simColor(pair.similarity) }}>{pair.similarity.toFixed(0)}%</Typography>
                      <Typography variant="caption" color="text.secondary">{severityLabel(pair.similarity)}</Typography>
                    </Box>
                    <Box sx={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, minWidth: 0 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{pair.student_a_name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>{pair.student_a_email}</Typography>
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{pair.student_b_name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>{pair.student_b_email}</Typography>
                      </Box>
                    </Box>
                    <Chip label={pair.language} size="small" sx={{ fontFamily: "ui-monospace, monospace", flexShrink: 0, bgcolor: "surfaceContainerHigh", color: "onSurfaceVariant" }} />
                    <Button size="small" variant="outlined" color="warning" onClick={() => setDiffPairId(pair.id)} sx={{ flexShrink: 0, whiteSpace: "nowrap" }}>
                      Compare code
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </Box>
        </Stack>
      )}

      <PlagiarismDiffModal assignmentId={assignmentId} pairId={diffPairId} onClose={() => setDiffPairId(null)} />
    </Box>
  );
}
