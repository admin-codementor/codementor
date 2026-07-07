"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Alert from "@mui/material/Alert";
import { RefreshIcon, CheckCircleIcon, CancelIcon, DnsOutlinedIcon, MemoryOutlinedIcon, LayersOutlinedIcon, SellOutlinedIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";

interface QueueStats {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  depth: number;
}
interface HealthData {
  online: boolean;
  version: string;
  workers: unknown;
  queue: QueueStats | null;
  system_info: Record<string, unknown> | null;
  error?: string;
  checked_at: string;
}

const REFRESH_MS = 10000;

function workerCount(workers: unknown): number | null {
  if (!Array.isArray(workers)) return null;
  let total = 0;
  let found = false;
  for (const w of workers) {
    if (w && typeof w === "object") {
      const size = (w as Record<string, unknown>).size;
      const available = (w as Record<string, unknown>).available;
      const val = typeof size === "number" ? size : typeof available === "number" ? available : null;
      if (val !== null) {
        total += val;
        found = true;
      }
    }
  }
  return found ? total : workers.length;
}

export default function JudgeHealthPage() {
  const [data, setData] = React.useState<HealthData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const initialLoad = React.useRef(true);

  const load = React.useCallback(async () => {
    if (initialLoad.current) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get("/api/judge-health");
      if (res.data?.success) {
        setData(res.data.data);
        setError(null);
      } else {
        setError(res.data?.error || "Failed to load judge health");
      }
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err?.response?.data?.error || err?.message || "Failed to load judge health");
    } finally {
      initialLoad.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const wc = data ? workerCount(data.workers) : null;
  const sysEntries = data?.system_info ? Object.entries(data.system_info) : [];

  return (
    <Box>
      <PageHeader
        title="Judge Health"
        subtitle={`Live status of the Judge0 execution backend.${data?.checked_at ? ` Last checked ${new Date(data.checked_at).toLocaleTimeString()}.` : ""}`}
        actions={
          <Button variant="outlined" startIcon={<RefreshIcon sx={{ animation: refreshing ? "spin 1s linear infinite" : "none", "@keyframes spin": { to: { transform: "rotate(360deg)" } } }} />} onClick={load} disabled={loading || refreshing}>
            Refresh
          </Button>
        }
      />

      {loading ? (
        <Stack spacing={2}>
          <Skeleton variant="rounded" height={40} width={120} />
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 2 }}>
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} variant="rounded" height={100} />)}
          </Box>
        </Stack>
      ) : (
        <Stack spacing={3}>
          {/* Status pill */}
          <Box>
            <Chip
              icon={data?.online ? <CheckCircleIcon /> : <CancelIcon />}
              label={data?.online ? "Online" : "Offline"}
              sx={{
                fontWeight: 600,
                bgcolor: data?.online ? "successContainer" : "errorContainer",
                color: data?.online ? "onSuccessContainer" : "onErrorContainer",
                "& .MuiChip-icon": { color: "inherit" },
              }}
            />
          </Box>

          {(error || data?.error) && <Alert severity="error">{error || data?.error}</Alert>}

          {/* Stat grid */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 2 }}>
            <StatCard icon={<SellOutlinedIcon />} label="Version" value={data?.version ?? "unknown"} accent="primary" />
            <StatCard icon={<MemoryOutlinedIcon />} label="Workers" value={wc !== null ? wc : "—"} helper={wc === null ? "Not reported" : "Active execution workers"} accent="success" />
            <StatCard icon={<LayersOutlinedIcon />} label="Queue Depth" value={data?.queue ? data.queue.depth : "—"} helper={data?.queue ? `${data.queue.waiting} waiting · ${data.queue.active} active` : "Queue not available"} accent="warning" />
          </Box>

          {/* Queue breakdown */}
          {data?.queue && (
            <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <LayersOutlinedIcon sx={{ color: "warning.main", fontSize: 20 }} />
                  <Typography variant="subtitle2" fontWeight={600}>Submissions Queue</Typography>
                </Stack>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(5, 1fr)" }, gap: 1.5 }}>
                  {([
                    ["Waiting", data.queue.waiting, "warning.main"],
                    ["Active", data.queue.active, "primary.main"],
                    ["Delayed", data.queue.delayed, "text.secondary"],
                    ["Completed", data.queue.completed, "success.main"],
                    ["Failed", data.queue.failed, "error.main"],
                  ] as [string, number, string][]).map(([label, val, color]) => (
                    <Card key={label} variant="outlined" sx={{ p: 1.5, borderColor: "outlineVariant" }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{label}</Typography>
                      <Typography variant="h6" fontWeight={700} sx={{ color }}>{val}</Typography>
                    </Card>
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}

          {/* System info */}
          <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <DnsOutlinedIcon sx={{ color: "primary.main", fontSize: 20 }} />
                <Typography variant="subtitle2" fontWeight={600}>System Info</Typography>
              </Stack>
              {sysEntries.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No system information available{data && !data.online ? " — backend is offline." : "."}
                </Typography>
              ) : (
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, columnGap: 3, rowGap: 0.5 }}>
                  {sysEntries.map(([key, value]) => (
                    <Stack key={key} direction="row" justifyContent="space-between" spacing={2} sx={{ py: 0.75, borderBottom: "1px solid", borderColor: "outlineVariant" }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "ui-monospace, monospace" }}>{key}</Typography>
                      <Typography variant="caption" sx={{ fontFamily: "ui-monospace, monospace", textAlign: "right", wordBreak: "break-all" }}>
                        {typeof value === "object" ? JSON.stringify(value) : String(value)}
                      </Typography>
                    </Stack>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Stack>
      )}
    </Box>
  );
}
