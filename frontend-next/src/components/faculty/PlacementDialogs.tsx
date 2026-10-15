"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
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
import { useConfirm } from "@/components/feedback/ConfirmProvider";
import { useToast } from "@/components/feedback/ToastProvider";
import { EmptyState } from "@/components/ui/States";
import { SearchField } from "@/components/ui/SearchField";
import { GroupsOutlinedIcon } from "@/components/ui/icons";
import { radius } from "@/theme/tokens";
import { headRow } from "./DepartmentTables";

export interface Drive {
  id: string; company: string; role: string; date: string | null; ctc: string;
  eligible_years: number[]; rounds: string[]; status: "open" | "closed"; department: string | null;
}
type AppStatus = "applied" | "shortlisted" | "selected" | "rejected";
interface DriveStudent {
  id: string; name: string; roll_no: string | null; section: string | null; year: number | null;
  status: AppStatus | null; round_results: Record<string, "passed" | "failed">;
}

const YEARS = [1, 2, 3, 4, 5, 6];
const STATUS_LABEL: Record<AppStatus, string> = { applied: "Applied", shortlisted: "Shortlisted", selected: "Selected", rejected: "Rejected" };

/** Create or edit a drive. */
export function DriveFormDialog({ open, onClose, drive }: { open: boolean; onClose: () => void; drive: Drive | null }) {
  const qc = useQueryClient();
  const showToast = useToast();
  const confirm = useConfirm();
  const [company, setCompany] = React.useState("");
  const [role, setRole] = React.useState("");
  const [date, setDate] = React.useState("");
  const [ctc, setCtc] = React.useState("");
  const [years, setYears] = React.useState<number[]>([]);
  const [rounds, setRounds] = React.useState("");
  const [status, setStatus] = React.useState<"open" | "closed">("open");

  React.useEffect(() => {
    if (!open) return;
    setCompany(drive?.company ?? ""); setRole(drive?.role ?? ""); setDate(drive?.date ?? ""); setCtc(drive?.ctc ?? "");
    setYears(drive?.eligible_years ?? []); setRounds((drive?.rounds ?? []).join(", ")); setStatus(drive?.status ?? "open");
  }, [open, drive]);

  const body = () => ({
    company, role, date: date || null, ctc, eligible_years: years, status,
    rounds: rounds.split(",").map((r) => r.trim()).filter(Boolean),
  });

  const save = useMutation({
    mutationFn: async () => (drive ? api.patch(`/api/faculty/placement/drives/${drive.id}`, body()) : api.post("/api/faculty/placement/drives", body())),
    onSuccess: () => {
      showToast(drive ? "Drive updated" : "Drive created", { severity: "success" });
      qc.invalidateQueries({ queryKey: ["faculty", "placement"] });
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: async () => api.delete(`/api/faculty/placement/drives/${drive!.id}`),
    onSuccess: () => { showToast("Drive deleted", { severity: "success" }); qc.invalidateQueries({ queryKey: ["faculty", "placement"] }); onClose(); },
    onError: (e) => showToast(apiErrorMessage(e, "Could not delete the drive."), { severity: "error" }),
  });

  const toggleYear = (y: number) => setYears((cur) => (cur.includes(y) ? cur.filter((x) => x !== y) : [...cur, y].sort()));

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="drive-title">
      <Box component="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); if (company.trim().length >= 2) save.mutate(); }}>
        <DialogTitle id="drive-title">{drive ? "Edit drive" : "New placement drive"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField size="small" label="Company" value={company} onChange={(e) => setCompany(e.target.value)} required autoFocus slotProps={{ htmlInput: { maxLength: 80 } }} />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField size="small" label="Role" value={role} onChange={(e) => setRole(e.target.value)} fullWidth slotProps={{ htmlInput: { maxLength: 80 } }} />
              <TextField size="small" label="Package" value={ctc} onChange={(e) => setCtc(e.target.value)} fullWidth placeholder="e.g. 6 LPA" slotProps={{ htmlInput: { maxLength: 40 } }} />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField size="small" label="Drive date" type="date" value={date} onChange={(e) => setDate(e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
              <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value as "open" | "closed")} fullWidth>
                <MenuItem value="open">Open</MenuItem>
                <MenuItem value="closed">Closed</MenuItem>
              </TextField>
            </Stack>
            <Box>
              <Typography variant="caption" color="text.secondary">Eligible years (none selected means every year)</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                {YEARS.map((y) => (
                  <Chip key={y} label={`Year ${y}`} size="small" clickable onClick={() => toggleYear(y)} color={years.includes(y) ? "primary" : "default"} variant={years.includes(y) ? "filled" : "outlined"} />
                ))}
              </Stack>
            </Box>
            <TextField
              size="small" label="Rounds, in order" value={rounds} onChange={(e) => setRounds(e.target.value)}
              placeholder="Aptitude, Technical, HR" helperText="Comma separated, up to 8. You record a pass or fail for each round later."
            />
            {save.isError && <Alert severity="error">{apiErrorMessage(save.error, "Could not save the drive.")}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          {drive && (
            <Button
              color="error" sx={{ mr: "auto" }} disabled={remove.isPending}
              onClick={async () => { if (await confirm({ title: "Delete this drive?", description: "Every student's result recorded for it is deleted too. This cannot be undone.", destructive: true, confirmLabel: "Delete" })) remove.mutate(); }}
            >
              Delete drive
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={company.trim().length < 2 || save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

/** Record each eligible student's outcome and round results for one drive. */
export function DriveResultsDialog({ driveId, onClose }: { driveId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useToast();
  const [q, setQ] = React.useState("");
  const [edits, setEdits] = React.useState<Record<string, { status: AppStatus | null; round_results: Record<string, "passed" | "failed"> }>>({});

  const query = useQuery<{ drive: Drive; students: DriveStudent[] }>({
    queryKey: ["faculty", "placement", "drive", driveId],
    queryFn: async () => (await api.get(`/api/faculty/placement/drives/${driveId}`)).data.data,
    enabled: !!driveId,
  });
  const d = query.data;

  React.useEffect(() => { setEdits({}); setQ(""); }, [driveId]);

  const current = (s: DriveStudent) => edits[s.id] ?? { status: s.status, round_results: s.round_results };
  const dirty = Object.keys(edits);

  const save = useMutation({
    mutationFn: async () => (await api.put(`/api/faculty/placement/drives/${driveId}/applications`, {
      updates: dirty.map((id) => ({ student_id: id, status: edits[id].status, round_results: edits[id].round_results })),
    })).data.data as { saved: number },
    onSuccess: (r) => {
      showToast(`Saved ${r.saved} student(s)`, { severity: "success" });
      qc.invalidateQueries({ queryKey: ["faculty", "placement"] });
      onClose();
    },
  });

  const setStatus = (s: DriveStudent, status: AppStatus | null) => setEdits((cur) => ({ ...cur, [s.id]: { ...(cur[s.id] ?? { round_results: s.round_results }), status } }));
  const setRound = (s: DriveStudent, round: string, result: "passed" | "failed" | "") => setEdits((cur) => {
    const base = cur[s.id] ?? { status: s.status, round_results: s.round_results };
    const rr = { ...base.round_results };
    if (result) rr[round] = result; else delete rr[round];
    return { ...cur, [s.id]: { ...base, round_results: rr } };
  });

  const shown = (d?.students ?? []).filter((s) => !q.trim() || `${s.name} ${s.roll_no ?? ""} ${s.section ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Dialog open={!!driveId} onClose={onClose} fullWidth maxWidth="lg" aria-labelledby="results-title">
      <DialogTitle id="results-title">{d ? `${d.drive.company}${d.drive.role ? ` — ${d.drive.role}` : ""}` : "Drive results"}</DialogTitle>
      <DialogContent dividers>
        {query.isError ? (
          <Alert severity="error">{apiErrorMessage(query.error, "Could not load the drive.")}</Alert>
        ) : query.isLoading || !d ? (
          <Skeleton variant="rounded" height={240} />
        ) : (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              {d.students.length} eligible student(s). Set a status for each who took part; leave the rest as &quot;Not applied&quot;.
              A student with a failed round cannot be marked Selected.
            </Typography>
            <SearchField value={q} onChange={setQ} placeholder="Search students" label="Search students" sx={{ maxWidth: 320 }} />
            {shown.length === 0 ? (
              <EmptyState compact icon={<GroupsOutlinedIcon />} title={d.students.length === 0 ? "No eligible students" : "No students match"} description={d.students.length === 0 ? "Check the drive's eligible years." : undefined} />
            ) : (
              <Box sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: radius.md, overflow: "hidden" }}>
                <TableContainer sx={{ maxHeight: 420, overflow: "auto" }}>
                  <Table size="small" stickyHeader aria-label="Eligible students and their results">
                    <TableHead>
                      <TableRow sx={headRow}>
                        <TableCell>Student</TableCell>
                        <TableCell sx={{ minWidth: 150 }}>Status</TableCell>
                        {d.drive.rounds.map((r) => <TableCell key={r} sx={{ minWidth: 130 }}>{r}</TableCell>)}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {shown.map((s) => {
                        const c = current(s);
                        return (
                          <TableRow key={s.id} sx={{ bgcolor: edits[s.id] ? "primaryContainer" : undefined, "& td": { borderColor: "outlineVariant" } }}>
                            <TableCell>
                              <Typography variant="body2" fontWeight={500}>{s.name}</Typography>
                              <Typography variant="caption" color="text.secondary">{[s.roll_no, s.section && `Sec ${s.section}`, s.year && `Year ${s.year}`].filter(Boolean).join(" · ")}</Typography>
                            </TableCell>
                            <TableCell>
                              <TextField select size="small" fullWidth value={c.status ?? ""} onChange={(e) => setStatus(s, (e.target.value || null) as AppStatus | null)} aria-label={`Status for ${s.name}`}>
                                <MenuItem value="">Not applied</MenuItem>
                                {(Object.keys(STATUS_LABEL) as AppStatus[]).map((k) => <MenuItem key={k} value={k}>{STATUS_LABEL[k]}</MenuItem>)}
                              </TextField>
                            </TableCell>
                            {d.drive.rounds.map((r) => (
                              <TableCell key={r}>
                                <TextField
                                  select size="small" fullWidth value={c.round_results[r] ?? ""} disabled={!c.status}
                                  onChange={(e) => setRound(s, r, e.target.value as "passed" | "failed" | "")} aria-label={`${r} result for ${s.name}`}
                                >
                                  <MenuItem value="">—</MenuItem>
                                  <MenuItem value="passed">Passed</MenuItem>
                                  <MenuItem value="failed">Failed</MenuItem>
                                </TextField>
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
            {save.isError && <Alert severity="error">{apiErrorMessage(save.error, "Could not save the results.")}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, pl: 1 }}>{dirty.length ? `${dirty.length} changed` : "No changes"}</Typography>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={() => save.mutate()} disabled={dirty.length === 0 || save.isPending}>{save.isPending ? "Saving…" : "Save results"}</Button>
      </DialogActions>
    </Dialog>
  );
}
