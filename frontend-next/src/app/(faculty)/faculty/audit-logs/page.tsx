"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { DownloadOutlinedIcon } from "@/components/ui/icons";
import { useToast } from "@/components/feedback/ToastProvider";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { headRow } from "@/components/faculty/DepartmentTables";
import { LOGIN_KIND, fmtWhen, type LoginEvent } from "@/components/admin/types";

interface AuditRow { id: string; action: string; detail: string | null; ip: string | null; at_ms: number | null; user_id: string | null; user_name: string | null; user_email: string | null }
interface AuditPage { rows: AuditRow[]; looked_at: number; whole_log: boolean; more: boolean }
interface LoginRow extends Omit<LoginEvent, "agent"> { role: string; user_id: string; user_name: string | null; user_email: string | null }

type View = "audit" | "logins";
const VIEWS = [{ value: "audit" as const, label: "Actions" }, { value: "logins" as const, label: "Failed sign-ins" }];

// Colour-code action families so the trail is scannable.
function actionColor(a: string): string {
  if (a.startsWith("admin.account") || a.startsWith("permissions")) return "secondary.main";
  if (a.startsWith("admin.settings")) return "primary.main";
  if (a.includes("delete") || a.includes("disable")) return "error.main";
  if (a.includes("export")) return "warning.main";
  return "text.secondary";
}

function AuditInner() {
  const showToast = useToast();
  const [view, setView] = React.useState<View>("audit");
  const [q, setQ] = React.useState("");
  const [action, setAction] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const search = useDebouncedValue(q, 400);
  const params = { q: search || undefined, action: action || undefined, from: from || undefined, to: to || undefined };

  const audit = useQuery<AuditPage>({
    queryKey: ["admin", "audit", params],
    queryFn: async () => (await api.get("/api/admin/audit", { params })).data.data,
    placeholderData: keepPreviousData, staleTime: 15_000, enabled: view === "audit",
  });
  const logins = useQuery<LoginRow[]>({ queryKey: ["admin", "logins"], queryFn: async () => (await api.get("/api/admin/logins", { params: { failed: 1 } })).data.data, staleTime: 15_000, enabled: view === "logins" });

  const download = useMutation({
    mutationFn: async () => {
      const res = await api.get("/api/admin/audit/export", { params, responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url; a.download = "audit-log.csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    onSuccess: () => showToast("Downloaded. The export itself was logged.", { severity: "success" }),
    onError: (e) => showToast(apiErrorMessage(e, "The export could not be made."), { severity: "error" }),
  });

  const rows = audit.data?.rows ?? [];
  return (
    <>
      <PageHeader title="Audit log" subtitle="Who did what, and when. Entries are kept for one year, then removed." actions={view === "audit" ? <Button startIcon={<DownloadOutlinedIcon />} onClick={() => download.mutate()} disabled={download.isPending}>{download.isPending ? "Preparing…" : "Export CSV"}</Button> : undefined} />
      <SegmentedButtons<View> value={view} onChange={setView} segments={VIEWS} ariaLabel="Audit view" />
      {view === "audit" ? (
        <>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} sx={{ my: 2 }}>
            <TextField size="small" label="Search" placeholder="Person, action or detail" value={q} onChange={(e) => setQ(e.target.value)} sx={{ minWidth: 260 }} />
            <TextField size="small" label="Action starts with" placeholder="e.g. placement." value={action} onChange={(e) => setAction(e.target.value)} sx={{ minWidth: 200 }} />
            <TextField size="small" type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="date" label="To" value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
          <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
            <DataState loading={audit.isLoading} fetching={audit.isFetching} error={audit.isError ? audit.error : undefined} onRetry={() => audit.refetch()} skeleton={<TableSkeleton rows={8} columns={5} />}
              empty={!!audit.data && rows.length === 0} emptyVariant="filtered" emptyTitle="Nothing matches" emptyDescription="Try fewer filters or a wider date range.">
              <TableContainer sx={{ overflowX: "auto" }}>
                <Table size="small" aria-label="Audit log" sx={{ minWidth: 760 }}>
                  <TableHead><TableRow sx={headRow}><TableCell>When</TableCell><TableCell>Who</TableCell><TableCell>Action</TableCell><TableCell>Detail</TableCell><TableCell>Address</TableCell></TableRow></TableHead>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id} sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtWhen(r.at_ms)}</TableCell>
                        <TableCell><Typography variant="body2">{r.user_name ?? "Unknown"}</Typography><Typography variant="caption" color="text.secondary">{r.user_email}</Typography></TableCell>
                        <TableCell><Typography variant="body2" fontFamily="ui-monospace, monospace" color={actionColor(r.action)}>{r.action}</Typography></TableCell>
                        <TableCell sx={{ maxWidth: 360, wordBreak: "break-word" }}>{r.detail ?? ""}</TableCell>
                        <TableCell>{r.ip ?? ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </DataState>
          </Card>
          {audit.data && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
            Showing the newest {rows.length} matching entries. {audit.data.whole_log ? "The whole log was searched." : `Looked through the latest ${audit.data.looked_at} entries; narrow by date to search further back.`} The export takes up to 5000.
          </Typography>}
        </>
      ) : (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden", mt: 2 }}>
          <Alert severity="info" sx={{ m: 2 }}>Wrong two-factor codes and sign-ins refused because the account is disabled. A wrong password is checked by Firebase and is not listed here.</Alert>
          <DataState loading={logins.isLoading} error={logins.isError ? logins.error : undefined} onRetry={() => logins.refetch()} skeleton={<TableSkeleton rows={6} columns={4} />}
            empty={!!logins.data && logins.data.length === 0} emptyVariant="firstUse" emptyTitle="None recently" emptyDescription="No wrong codes or blocked sign-ins among the latest 200 sign-in events.">
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small" aria-label="Failed sign-ins" sx={{ minWidth: 560 }}>
                <TableHead><TableRow sx={headRow}><TableCell>When</TableCell><TableCell>Who</TableCell><TableCell>What happened</TableCell><TableCell>Address</TableCell></TableRow></TableHead>
                <TableBody>
                  {(logins.data ?? []).map((l, i) => (
                    <TableRow key={i} sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtWhen(l.at_ms)}</TableCell>
                      <TableCell><Typography variant="body2">{l.user_name ?? "Unknown"}</Typography><Typography variant="caption" color="text.secondary">{l.user_email}</Typography></TableCell>
                      <TableCell>{LOGIN_KIND[l.kind]}</TableCell>
                      <TableCell>{l.ip ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </DataState>
        </Card>
      )}
    </>
  );
}

export default function AuditLogPage() {
  return <AuthGuard roles={["admin"]}><AuditInner /></AuthGuard>;
}
