"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { ListSkeleton, TableSkeleton } from "@/components/ui/Skeletons";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { useToast } from "@/components/feedback/ToastProvider";
import { RefreshIcon } from "@/components/ui/icons";
import { headRow } from "@/components/faculty/DepartmentTables";
import { fmtWhen } from "@/components/admin/types";

type Status = "ok" | "repaired" | "warn" | "error";
interface CheckResult { key: string; label: string; status: Status; found: number; repaired: number; detail: string }
interface SelfCheck { at_ms: number; status: Status; results: CheckResult[] }
interface Health {
  judge: { state: "closed" | "open" | "half-open"; recent_failures: number; retry_at_ms: number | null };
  self_check: SelfCheck | null;
  given_up_24h: { job_id: string; at_ms: number; reason: string; age_ms: number; user_id: string | null; problem_id: string | null; exam_id: string | null }[];
  open_reports: number;
}
interface Report { id: string; at_ms: number; status: "open" | "seen" | "resolved"; request_id: string | null; page: string; message: string; code: string | null; http_status: number | null; role: string; user_name: string | null; user_email: string | null }

const STATUS_STYLE: Record<Status, { label: string; bg: string; fg: string }> = {
  ok: { label: "All good", bg: "successContainer", fg: "onSuccessContainer" },
  repaired: { label: "Put right", bg: "primaryContainer", fg: "onPrimaryContainer" },
  warn: { label: "Needs a look", bg: "warningContainer", fg: "onWarningContainer" },
  error: { label: "Could not run", bg: "errorContainer", fg: "onErrorContainer" },
};
const JUDGE_TEXT = { closed: "Answering normally", open: "Not answering: new work is held back for a few seconds at a time", "half-open": "Being tested again" } as const;

type View = "health" | "reports";
const VIEWS = [{ value: "health" as const, label: "Health" }, { value: "reports" as const, label: "Problem reports" }];

function HealthView() {
  const qc = useQueryClient();
  const showToast = useToast();
  const query = useQuery<Health>({ queryKey: ["admin", "health"], queryFn: async () => (await api.get("/api/admin/health")).data.data, staleTime: 15_000, refetchInterval: 30_000 });
  const run = useMutation({
    mutationFn: async () => (await api.post("/api/admin/health/self-check")).data.data as SelfCheck,
    onSuccess: (r) => { showToast(r.status === "ok" ? "Everything checked out." : "Checked. See the results below.", { severity: r.status === "ok" ? "success" : "info" }); void qc.invalidateQueries({ queryKey: ["admin", "health"] }); },
    onError: (e) => showToast(apiErrorMessage(e, "The check could not run."), { severity: "error" }),
  });
  const d = query.data;
  return (
    <DataState loading={query.isLoading} error={query.isError ? query.error : undefined} onRetry={() => query.refetch()} skeleton={<ListSkeleton rows={4} />}>
      {d && (
        <Stack spacing={3}>
          <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: 2.5 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
              <div style={{ flex: 1 }}>
                <Typography variant="subtitle1" fontWeight={600}>Code judge</Typography>
                <Typography variant="body2" color="text.secondary">{JUDGE_TEXT[d.judge.state]}{d.judge.retry_at_ms && d.judge.state === "open" ? `. It is tested again at ${new Date(d.judge.retry_at_ms).toLocaleTimeString()}.` : ""}</Typography>
              </div>
              <Chip label={d.judge.state === "closed" ? "Working" : d.judge.state === "open" ? "Down" : "Testing"} color={d.judge.state === "closed" ? "success" : "warning"} />
            </Stack>
          </Card>

          <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: 2.5 }}>
            <Stack spacing={2}>
              <Stack direction="row" spacing={2} alignItems="center">
                <div style={{ flex: 1 }}>
                  <Typography variant="subtitle1" fontWeight={600}>Daily self-check</Typography>
                  <Typography variant="body2" color="text.secondary">{d.self_check ? `Last ran ${fmtWhen(d.self_check.at_ms)}.` : "It has not run yet. It runs once a day on its own."} It puts right mentors that drifted from the class structure and applications whose drive was deleted, and reports everything else.</Typography>
                </div>
                <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => run.mutate()} disabled={run.isPending}>{run.isPending ? "Checking…" : "Run it now"}</Button>
              </Stack>
              {d.self_check && (
                <Stack spacing={1}>
                  {d.self_check.results.map((r) => (
                    <Stack key={r.key} direction="row" spacing={1.5} alignItems="flex-start">
                      <Chip size="small" label={STATUS_STYLE[r.status].label} sx={{ minWidth: 104, bgcolor: STATUS_STYLE[r.status].bg, color: STATUS_STYLE[r.status].fg, fontWeight: 600 }} />
                      <div><Typography variant="body2" fontWeight={500}>{r.label}</Typography><Typography variant="caption" color="text.secondary">{r.detail}</Typography></div>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>

          <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ p: 2.5, pb: 1 }}>Submissions given up on in the last day</Typography>
            {d.given_up_24h.length === 0 ? <Typography variant="body2" color="text.secondary" sx={{ p: 2.5, pt: 0 }}>None. Every submission was checked.</Typography> : (
              <>
                <Alert severity="warning" sx={{ mx: 2.5, mb: 1.5 }}>These were still unfinished after 15 minutes and were stopped. The student was told to submit again. If many appear at once, check the code judge.</Alert>
                <TableContainer>
                  <Table size="small" aria-label="Submissions given up on">
                    <TableHead><TableRow sx={headRow}><TableCell>When</TableCell><TableCell>Why</TableCell><TableCell>Open for</TableCell><TableCell>Student</TableCell><TableCell>Exam</TableCell></TableRow></TableHead>
                    <TableBody>
                      {d.given_up_24h.map((j) => (
                        <TableRow key={j.job_id} sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                          <TableCell>{fmtWhen(j.at_ms)}</TableCell><TableCell>{j.reason}</TableCell><TableCell>{Math.round(j.age_ms / 60000)} min</TableCell>
                          <TableCell>{j.user_id ?? "—"}</TableCell><TableCell>{j.exam_id ? "In an exam" : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </Card>
        </Stack>
      )}
    </DataState>
  );
}

function ReportsView() {
  const qc = useQueryClient();
  const showToast = useToast();
  const [filter, setFilter] = React.useState<"open" | "all">("open");
  const query = useQuery<Report[]>({ queryKey: ["admin", "reports", filter], queryFn: async () => (await api.get("/api/admin/problem-reports", { params: filter === "open" ? { status: "open" } : {} })).data.data, staleTime: 15_000 });
  const mark = useMutation({
    mutationFn: async (v: { id: string; status: string }) => api.post(`/api/admin/problem-reports/${v.id}/status`, { status: v.status }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin"] }); },
    onError: (e) => showToast(apiErrorMessage(e, "Could not change it."), { severity: "error" }),
  });
  const rows = query.data ?? [];
  return (
    <Stack spacing={2}>
      <SegmentedButtons<"open" | "all"> value={filter} onChange={setFilter} segments={[{ value: "open", label: "Open" }, { value: "all", label: "All" }]} ariaLabel="Which reports" />
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
        <DataState loading={query.isLoading} error={query.isError ? query.error : undefined} onRetry={() => query.refetch()} skeleton={<TableSkeleton rows={5} columns={4} />}
          empty={rows.length === 0} emptyVariant="firstUse" emptyTitle="No reports" emptyDescription="When someone presses Report this problem on an error screen it appears here, with the reference to find the server log.">
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small" aria-label="Problem reports" sx={{ minWidth: 720 }}>
              <TableHead><TableRow sx={headRow}><TableCell>When</TableCell><TableCell>Who</TableCell><TableCell>What</TableCell><TableCell>Reference</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} sx={{ "& td": { borderColor: "outlineVariant", verticalAlign: "top" }, "&:last-child td": { border: 0 } }}>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtWhen(r.at_ms)}</TableCell>
                    <TableCell><Typography variant="body2">{r.user_name ?? "Unknown"}</Typography><Typography variant="caption" color="text.secondary">{r.role}</Typography></TableCell>
                    <TableCell sx={{ maxWidth: 360, wordBreak: "break-word" }}>
                      <Typography variant="body2">{r.message || <i>No words added</i>}</Typography>
                      <Typography variant="caption" color="text.secondary">{[r.page, r.code, r.http_status].filter(Boolean).join(" · ")}</Typography>
                    </TableCell>
                    <TableCell><Typography variant="body2" fontFamily="ui-monospace, monospace" sx={{ userSelect: "all" }}>{r.request_id ?? "—"}</Typography></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {r.status === "open" && <Button size="small" onClick={() => mark.mutate({ id: r.id, status: "seen" })}>Seen</Button>}
                      {r.status !== "resolved" ? <Button size="small" onClick={() => mark.mutate({ id: r.id, status: "resolved" })}>Resolved</Button> : <Chip size="small" label="Resolved" />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DataState>
      </Card>
      <Typography variant="caption" color="text.secondary">To find what went wrong, search the server log for the reference.</Typography>
    </Stack>
  );
}

export default function HealthPage() {
  const [view, setView] = React.useState<View>("health");
  return (
    <>
      <PageHeader title="System health" subtitle="Whether the code judge is answering, what the daily self-check found and put right, and what people have reported." />
      <SegmentedButtons<View> value={view} onChange={setView} segments={VIEWS} ariaLabel="Health view" />
      <div style={{ marginTop: 24 }}>{view === "health" ? <HealthView /> : <ReportsView />}</div>
    </>
  );
}
