"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { useConfirm } from "@/components/feedback/ConfirmProvider";
import { useToast } from "@/components/feedback/ToastProvider";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { AddIcon } from "@/components/ui/icons";
import { headRow } from "@/components/faculty/DepartmentTables";

type OutsideStatus = "applied" | "selected" | "rejected";
interface Outside { id: string; student_id: string; name: string; roll_no: string | null; department: string | null; company: string; role: string; ctc: string; status: OutsideStatus }
interface Pick { id: string; name: string; roll_no: string | null; department: string | null }
const LABEL: Record<OutsideStatus, string> = { applied: "Applied", selected: "Selected (an offer)", rejected: "Rejected" };

function OutsideDialog({ open, onClose, row }: { open: boolean; onClose: () => void; row: Outside | null }) {
  const qc = useQueryClient();
  const showToast = useToast();
  const [student, setStudent] = React.useState<Pick | null>(null);
  const [search, setSearch] = React.useState("");
  const [f, setF] = React.useState({ company: "", role: "", ctc: "", status: "applied" as OutsideStatus });
  const q = useDebouncedValue(search, 300);

  React.useEffect(() => {
    if (!open) return;
    setStudent(row ? { id: row.student_id, name: row.name, roll_no: row.roll_no, department: row.department } : null);
    setSearch("");
    setF({ company: row?.company ?? "", role: row?.role ?? "", ctc: row?.ctc ?? "", status: row?.status ?? "applied" });
  }, [open, row]);

  const found = useQuery<Pick[]>({
    queryKey: ["placement", "student-search", q],
    queryFn: async () => ((await api.get("/api/placement/records", { params: { q } })).data.data as Pick[]).slice(0, 20),
    enabled: open && !row && q.trim().length >= 2,
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: async () => (row ? api.patch(`/api/placement/outside/${row.id}`, f) : api.post("/api/placement/outside", { ...f, student_id: student?.id })),
    onSuccess: () => { showToast(row ? "Record updated" : "Recorded", { severity: "success" }); void qc.invalidateQueries({ queryKey: ["placement"] }); onClose(); },
  });

  return (
    <Dialog open={open} onClose={save.isPending ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="outside-title">
      <Box component="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); if (student && f.company.trim().length >= 2) save.mutate(); }}>
        <DialogTitle id="outside-title">{row ? "Edit outside application" : "Record an outside application"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">For a student who applied to a company on their own, outside the portal. An offer recorded here counts: the student can then apply only to dream drives.</Typography>
            {row ? <Typography variant="body2"><b>{row.name}</b> {row.roll_no ? `(${row.roll_no})` : ""}</Typography> : (
              <Autocomplete<Pick> options={found.data ?? []} value={student} onChange={(_, v) => setStudent(v)} inputValue={search} onInputChange={(_, v) => setSearch(v)}
                getOptionLabel={(o) => `${o.name}${o.roll_no ? ` (${o.roll_no})` : ""}`} isOptionEqualToValue={(a, b) => a.id === b.id} filterOptions={(x) => x} loading={found.isFetching}
                noOptionsText={search.trim().length < 2 ? "Type at least 2 letters of the name or roll number" : "No student found"}
                renderInput={(p) => <TextField {...p} size="small" label="Student" required autoFocus />} />
            )}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField size="small" label="Company" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} required fullWidth slotProps={{ htmlInput: { maxLength: 80 } }} />
              <TextField size="small" label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} fullWidth slotProps={{ htmlInput: { maxLength: 80 } }} />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField size="small" label="Package" value={f.ctc} onChange={(e) => setF({ ...f, ctc: e.target.value })} fullWidth placeholder="e.g. 6 LPA" slotProps={{ htmlInput: { maxLength: 40 } }} />
              <TextField select size="small" label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as OutsideStatus })} fullWidth>
                {(Object.keys(LABEL) as OutsideStatus[]).map((k) => <MenuItem key={k} value={k}>{LABEL[k]}</MenuItem>)}
              </TextField>
            </Stack>
            {save.isError && <Alert severity="error">{apiErrorMessage(save.error, "Could not save.")}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!student || f.company.trim().length < 2 || save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export default function TnpOutsidePage() {
  const qc = useQueryClient();
  const showToast = useToast();
  const confirm = useConfirm();
  const [dialog, setDialog] = React.useState<{ row: Outside | null } | null>(null);
  const query = useQuery<Outside[]>({ queryKey: ["placement", "outside"], queryFn: async () => (await api.get("/api/placement/outside")).data.data, staleTime: 30_000 });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/placement/outside/${id}`),
    onSuccess: () => { showToast("Removed", { severity: "success" }); void qc.invalidateQueries({ queryKey: ["placement"] }); },
    onError: (e) => showToast(apiErrorMessage(e, "Could not remove it."), { severity: "error" }),
  });
  const rows = query.data ?? [];

  return (
    <>
      <PageHeader title="Outside applications" subtitle="Applications and offers that happened outside the portal. They are listed separately from drives, and an offer here counts as a placement."
        actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ row: null })}>Record one</Button>} />
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
        <DataState loading={query.isLoading} error={query.isError ? query.error : undefined} onRetry={() => query.refetch()} skeleton={<TableSkeleton rows={5} columns={5} />}
          empty={rows.length === 0} emptyVariant="firstUse" emptyTitle="Nothing recorded yet" emptyDescription="When a student tells you about an application or offer made on their own, record it here."
          emptyAction={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ row: null })}>Record the first one</Button>}>
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small" aria-label="Outside applications" sx={{ minWidth: 640 }}>
              <TableHead><TableRow sx={headRow}><TableCell>Student</TableCell><TableCell>Company</TableCell><TableCell>Package</TableCell><TableCell>Status</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                    <TableCell><Typography variant="body2" fontWeight={500}>{r.name}</Typography><Typography variant="caption" color="text.secondary">{[r.roll_no, r.department].filter(Boolean).join(" · ")}</Typography></TableCell>
                    <TableCell><Typography variant="body2">{r.company}</Typography><Typography variant="caption" color="text.secondary">{r.role}</Typography></TableCell>
                    <TableCell>{r.ctc || "—"}</TableCell>
                    <TableCell><Chip size="small" label={r.status === "selected" ? "Offer" : r.status === "applied" ? "Applied" : "Rejected"} sx={{ height: 22, fontWeight: 600, bgcolor: r.status === "selected" ? "successContainer" : "surfaceContainerHigh", color: r.status === "selected" ? "onSuccessContainer" : "onSurfaceVariant" }} /></TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => setDialog({ row: r })}>Edit</Button>
                      <Button size="small" color="error" disabled={remove.isPending} onClick={async () => { if (await confirm({ title: "Remove this record?", description: `${r.name}'s ${r.company} record is deleted. If it was an offer, they can apply to normal drives again.`, destructive: true, confirmLabel: "Remove" })) remove.mutate(r.id); }}>Remove</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DataState>
      </Card>
      <OutsideDialog open={!!dialog} onClose={() => setDialog(null)} row={dialog?.row ?? null} />
    </>
  );
}
