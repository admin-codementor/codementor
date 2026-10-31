"use client";

import * as React from "react";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Pagination from "@mui/material/Pagination";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { SearchField } from "@/components/ui/SearchField";
import { AddIcon } from "@/components/ui/icons";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { bodyRow, headRow } from "@/components/faculty/DepartmentTables";
import { CreateAccountDialog, PersonDialog, FillBatchesButton } from "@/components/admin/PersonDialogs";
import { useBatches } from "@/components/faculty/DepartmentExportDialog";
import { ROLE_LABEL, fmtWhen, useSettings, type PeoplePage } from "@/components/admin/types";

const ROLES = ["faculty", "hod", "tnp", "admin", "student"];

export default function PeoplePageView() {
  const settings = useSettings();
  const [q, setQ] = React.useState("");
  const [role, setRole] = React.useState("");
  const [department, setDepartment] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [batch, setBatch] = React.useState("");
  const batches = useBatches();
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const search = useDebouncedValue(q, 300);
  // A new search or filter starts again from page 1.
  React.useEffect(() => { setPage(1); }, [search, role, department, status, batch]);

  const query = useQuery<PeoplePage>({
    queryKey: ["admin", "people", search, role, department, status, batch, page],
    queryFn: async () => (await api.get("/api/admin/people", { params: { q: search || undefined, role: role || undefined, department: department || undefined, status: status || undefined, batch: batch || undefined, page, size: 50 } })).data.data,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const d = query.data;

  return (
    <>
      <PageHeader title="People" subtitle="Every account in the college. Staff accounts are managed here; students are managed by their departments."
        actions={<Stack direction="row" spacing={1}><FillBatchesButton /><Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>Add staff account</Button></Stack>} />
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} sx={{ mb: 2 }}>
        <SearchField value={q} onChange={setQ} placeholder="Name, email or roll number" label="Search people" sx={{ maxWidth: 320 }} />
        <TextField select size="small" label="Role" value={role} onChange={(e) => setRole(e.target.value)} sx={{ minWidth: 190 }}>
          <MenuItem value="">Everyone</MenuItem>
          {ROLES.map((r) => <MenuItem key={r} value={r}>{ROLE_LABEL[r]}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">All departments</MenuItem>
          {(settings.data?.departments ?? []).map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Batch" value={batch} onChange={(e) => setBatch(e.target.value)} sx={{ minWidth: 150 }}>
          <MenuItem value="">All batches</MenuItem>
          {(batches.data ?? []).map((b) => <MenuItem key={b.name} value={b.name}>{b.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="">Any</MenuItem><MenuItem value="active">Active</MenuItem><MenuItem value="disabled">Disabled</MenuItem>
        </TextField>
        {d && <Typography variant="body2" color="text.secondary">{d.total} account{d.total === 1 ? "" : "s"}</Typography>}
      </Stack>
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
        <DataState loading={query.isLoading} fetching={query.isFetching} error={query.isError ? query.error : undefined} onRetry={() => query.refetch()} skeleton={<TableSkeleton rows={8} columns={5} />}
          empty={!!d && d.rows.length === 0} emptyVariant="filtered" emptyTitle="No accounts match" emptyDescription="Try a different search or clear a filter.">
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small" aria-label="People" sx={{ minWidth: 800 }}>
              <TableHead><TableRow sx={headRow}><TableCell>Name</TableCell><TableCell>Role</TableCell><TableCell>Department</TableCell><TableCell>Batch</TableCell><TableCell>Last signed in</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
              <TableBody>
                {(d?.rows ?? []).map((p) => (
                  <TableRow key={p.id} hover onClick={() => setOpen(p.id)} sx={bodyRow}>
                    <TableCell><Typography variant="body2" fontWeight={500}>{p.name}</Typography><Typography variant="caption" color="text.secondary">{[p.email, p.rollNo].filter(Boolean).join(" · ")}</Typography></TableCell>
                    <TableCell>{ROLE_LABEL[p.role] ?? p.role}</TableCell>
                    <TableCell>{p.department ?? "—"}</TableCell>
                    <TableCell>{p.batch ?? "—"}</TableCell>
                    <TableCell>{fmtWhen(p.last_login_ms)}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5}>
                        {p.disabled ? <Chip size="small" color="error" label="Disabled" sx={{ height: 22 }} /> : <Chip size="small" label="Active" sx={{ height: 22, bgcolor: "successContainer", color: "onSuccessContainer", fontWeight: 600 }} />}
                        {(p.role === "admin" || p.role === "tnp") && !p.twofa && <Chip size="small" color="warning" variant="outlined" label="No 2FA" sx={{ height: 22 }} />}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {d && d.pages > 1 && <Stack alignItems="center" sx={{ p: 2 }}><Pagination count={d.pages} page={d.page} onChange={(_, v) => setPage(v)} size="small" /></Stack>}
        </DataState>
      </Card>
      <PersonDialog id={open} onClose={() => setOpen(null)} />
      <CreateAccountDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
