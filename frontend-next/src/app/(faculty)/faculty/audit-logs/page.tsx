"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { ReceiptLongOutlinedIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchField } from "@/components/ui/SearchField";
import { EmptyState, ErrorState } from "@/components/ui/States";

interface LogRow {
  id: string;
  action: string;
  detail: string | null;
  ip: string | null;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
}

// Colour-code action families so the trail is scannable.
function actionColor(a: string): string {
  if (a.startsWith("permissions")) return "secondary.main";
  if (a.startsWith("plagiarism")) return "warning.main";
  if (a.startsWith("marks")) return "primary.main";
  if (a.includes("delete")) return "error.main";
  return "text.secondary";
}

function AuditLogInner() {
  const [rows, setRows] = React.useState<LogRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get("/api/faculty/audit-logs?limit=300")
      .then((r) => {
        if (r.data?.success) setRows(r.data.data);
      })
      .catch((e) => setError(e?.response?.data?.error || "Failed to load audit logs"))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = rows.filter((r) => {
    if (!q) return true;
    const hay = `${r.action} ${r.detail ?? ""} ${r.user_name ?? ""} ${r.user_email ?? ""} ${r.ip ?? ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <Box>
      <PageHeader
        title="Audit Log"
        subtitle="Trail of sensitive actions — permission changes, plagiarism runs, grade exports, deletions."
      />

      <SearchField value={q} onChange={setQ} placeholder="Filter by action, user, IP…" label="Filter audit log" sx={{ mb: 3, maxWidth: 360 }} />

      {loading ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: 2 }}>
          <Stack spacing={1}>{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={36} />)}</Stack>
        </Card>
      ) : error ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <ErrorState title="Couldn't load audit logs" description={error} onRetry={load} />
        </Card>
      ) : filtered.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState icon={<ReceiptLongOutlinedIcon />} title={rows.length === 0 ? "No audited actions yet" : "No matching entries"} />
        </Card>
      ) : (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table aria-label="Audit log" size="small" sx={{ minWidth: 720 }}>
              <TableHead>
                <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600, borderColor: "outlineVariant" } }}>
                  <TableCell sx={{ width: 140 }}>When</TableCell>
                  <TableCell sx={{ width: 180 }}>Action</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Detail</TableCell>
                  <TableCell sx={{ width: 120 }}>IP</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id} hover sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                    <TableCell sx={{ color: "text.secondary", whiteSpace: "nowrap" }}>
                      {new Date(r.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ fontFamily: "ui-monospace, monospace", fontWeight: 600, color: actionColor(r.action) }}>{r.action}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ display: "block" }}>{r.user_name || "—"}</Typography>
                      <Typography variant="caption" color="text.secondary">{r.user_email || ""}</Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>
                      <Typography variant="caption" color="text.secondary" noWrap title={r.detail || ""}>{r.detail || "—"}</Typography>
                    </TableCell>
                    <TableCell sx={{ fontFamily: "ui-monospace, monospace", color: "text.secondary" }}>{r.ip || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </Box>
  );
}

export default function AuditLogPage() {
  // Admin-only within the faculty area (mirrors the old RequireAdmin gate).
  return (
    <AuthGuard roles={["admin"]}>
      <AuditLogInner />
    </AuthGuard>
  );
}
