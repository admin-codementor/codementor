"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { DataState } from "@/components/ui/DataState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { SearchField } from "@/components/ui/SearchField";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { useToast } from "@/components/feedback/ToastProvider";
import { radius, typeScale } from "@/theme/tokens";
import { headRow } from "@/components/faculty/DepartmentTables";
import { DriveStateChip, TierChip, ruleSummary } from "./DrivesList";
import { STATUS_LABEL, fmtDate, fmtDateTime, type AppStatus, type Drive, type DriveStudent } from "./types";

interface DriveData { drive: Drive; students: DriveStudent[] }
type Filter = "all" | "applied" | "open" | "not_eligible";
const FILTERS = [
  { value: "all" as const, label: "Everyone" }, { value: "applied" as const, label: "Applied" },
  { value: "open" as const, label: "Can apply, not yet" }, { value: "not_eligible" as const, label: "Not eligible" },
];
type Edit = { status: AppStatus | null; round_results: Record<string, "passed" | "failed">; override_reason: string };

export const useDrive = (id: string | null) => useQuery<DriveData>({
  queryKey: ["placement", "drive", id],
  queryFn: async () => (await api.get(`/api/placement/drives/${id}`)).data.data,
  enabled: !!id,
});

const sub = (s: DriveStudent) => [s.roll_no, s.department, s.section && `Sec ${s.section}`, s.year && `Year ${s.year}`].filter(Boolean).join(" · ");

/** Write and send an in-app notice to the students who can apply and have not yet. */
function NoticeDialog({ open, onClose, driveId, company }: { open: boolean; onClose: () => void; driveId: string; company: string }) {
  const showToast = useToast();
  const [message, setMessage] = React.useState("");
  React.useEffect(() => { if (open) setMessage(""); }, [open]);
  const send = useMutation({
    mutationFn: async () => (await api.post(`/api/placement/drives/${driveId}/notify`, { message })).data.data as { sent: number },
    onSuccess: (r) => { showToast(r.sent === 0 ? "Nobody to tell: every eligible student has already applied." : `Told ${r.sent} student${r.sent === 1 ? "" : "s"}.`, { severity: r.sent === 0 ? "info" : "success" }); onClose(); },
  });
  return (
    <Dialog open={open} onClose={send.isPending ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="notice-title">
      <DialogTitle id="notice-title">Tell eligible students about {company}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Sent as a reminder to every student who can apply and has not yet. It does not go to students who are not eligible, who already applied, or who already have an offer (unless this is a dream drive).
          </Typography>
          <TextField size="small" label="Message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} multiline minRows={2} placeholder={`${company} is open for applications.`} slotProps={{ htmlInput: { maxLength: 200 } }} helperText={`${message.length}/200. Leave empty to send the standard message.`} />
          {send.isError && <Alert severity="error">{apiErrorMessage(send.error, "Could not send the notice.")}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={send.isPending}>Cancel</Button>
        <Button variant="contained" onClick={() => send.mutate()} disabled={send.isPending}>{send.isPending ? "Sending…" : "Send notice"}</Button>
      </DialogActions>
    </Dialog>
  );
}

/** One drive: its rules, who applied, who could, and (for T&P and the Admin) recording results and adding students by hand. */
export function DriveDetail({ driveId, canManage, onEdit }: { driveId: string; canManage: boolean; onEdit?: (d: Drive) => void }) {
  const qc = useQueryClient();
  const showToast = useToast();
  const query = useDrive(driveId);
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [edits, setEdits] = React.useState<Record<string, Edit>>({});
  const [notice, setNotice] = React.useState(false);
  const [now] = React.useState(() => Date.now()); // when the page was opened
  const d = query.data;

  React.useEffect(() => { setEdits({}); setQ(""); setFilter("all"); }, [driveId]);

  const current = (s: DriveStudent): Edit => edits[s.id] ?? { status: s.status, round_results: s.round_results, override_reason: "" };
  const dirty = Object.keys(edits);
  // A student who does not meet the rules can still be added, but only with a written reason that is kept with the record.
  const needsReason = (s: DriveStudent) => !!edits[s.id] && s.status == null && edits[s.id].status != null && !s.eligible;
  const missingReason = dirty.some((id) => { const s = d?.students.find((x) => x.id === id); return !!s && needsReason(s) && edits[id].override_reason.trim().length < 10; });

  const save = useMutation({
    mutationFn: async () => (await api.put(`/api/placement/drives/${driveId}/applications`, {
      updates: dirty.map((id) => ({ student_id: id, status: edits[id].status, round_results: edits[id].round_results, ...(edits[id].override_reason.trim() ? { override_reason: edits[id].override_reason.trim() } : {}) })),
    })).data.data as { saved: number },
    onSuccess: (r) => {
      showToast(`Saved ${r.saved} student${r.saved === 1 ? "" : "s"}`, { severity: "success" });
      setEdits({});
      void qc.invalidateQueries({ queryKey: ["placement"] });
    },
  });

  const setStatus = (s: DriveStudent, status: AppStatus | null) => setEdits((cur) => ({ ...cur, [s.id]: { ...(cur[s.id] ?? { round_results: s.round_results, override_reason: "" }), status } }));
  const setReason = (s: DriveStudent, v: string) => setEdits((cur) => ({ ...cur, [s.id]: { ...(cur[s.id] ?? { status: s.status, round_results: s.round_results, override_reason: "" }), override_reason: v } }));
  const setRound = (s: DriveStudent, round: string, result: "passed" | "failed" | "") => setEdits((cur) => {
    const base = cur[s.id] ?? { status: s.status, round_results: s.round_results, override_reason: "" };
    const rr = { ...base.round_results };
    if (result) rr[round] = result; else delete rr[round];
    return { ...cur, [s.id]: { ...base, round_results: rr } };
  });

  const setClosed = useMutation({
    mutationFn: async (status: "open" | "closed") => (await api.patch(`/api/placement/drives/${driveId}`, { status })).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["placement"] }),
    onError: (e) => showToast(apiErrorMessage(e, "Could not change the drive."), { severity: "error" }),
  });

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (d?.students ?? []).filter((s) => {
      if (needle && !`${s.name} ${s.roll_no ?? ""} ${s.section ?? ""} ${s.department ?? ""}`.toLowerCase().includes(needle)) return false;
      if (filter === "applied") return s.status != null;
      if (filter === "open") return s.status == null && s.eligible;
      if (filter === "not_eligible") return s.status == null && !s.eligible;
      return true;
    });
  }, [d, q, filter]);

  return (
    <DataState loading={query.isLoading} error={query.isError ? query.error : undefined} onRetry={() => query.refetch()} skeleton={<TableSkeleton rows={8} columns={6} />}>
      {d && (
        <Stack spacing={3}>
          <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: 2.5 }}>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <DriveStateChip d={d.drive} now={now} /><TierChip tier={d.drive.tier} />
                <Typography variant="body2" color="text.secondary">{[d.drive.role, d.drive.ctc].filter(Boolean).join(" · ")}</Typography>
              </Stack>
              <Typography variant="body2"><b>For:</b> {d.drive.departments.join(", ")}. {ruleSummary(d.drive)}.</Typography>
              <Typography variant="body2"><b>Last date to apply:</b> {d.drive.apply_by ? fmtDateTime(d.drive.apply_by) : "none"}{d.drive.date ? ` · Drive on ${fmtDate(d.drive.date)}` : ""}{d.drive.rounds.length ? ` · Rounds: ${d.drive.rounds.join(" → ")}` : ""}</Typography>
              {d.drive.link && <Typography variant="body2"><b>Company link:</b> <Link href={d.drive.link} target="_blank" rel="noopener noreferrer">{d.drive.link}</Link></Typography>}
              {d.drive.description && <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>{d.drive.description}</Typography>}
              {canManage && (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ pt: 0.5 }}>
                  <Button size="small" variant="outlined" onClick={() => onEdit?.(d.drive)}>Edit drive</Button>
                  {d.drive.publish_state === "published" && d.drive.status === "open" && <Button size="small" variant="outlined" onClick={() => setNotice(true)}>Tell eligible students</Button>}
                  {d.drive.publish_state === "published" && <Button size="small" color="inherit" disabled={setClosed.isPending} onClick={() => setClosed.mutate(d.drive.status === "open" ? "closed" : "open")}>{d.drive.status === "open" ? "Close applications" : "Reopen applications"}</Button>}
                </Stack>
              )}
            </Stack>
          </Card>

          {d.drive.publish_state === "draft" && canManage && <Alert severity="info">This is a draft. Students cannot see it. Edit the drive and set it to Published when it is ready.</Alert>}

          <Box>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} sx={{ mb: 2 }}>
              <SearchField value={q} onChange={setQ} placeholder="Name, roll no, section" label="Search students" sx={{ maxWidth: 320 }} />
              <SegmentedButtons<Filter> value={filter} onChange={setFilter} segments={FILTERS} ariaLabel="Show students" />
            </Stack>
            {canManage && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                Set a status for a student who took part. To add someone who does not meet the rules, choose a status and write why; the reason is kept with the record. A student with a failed round cannot be Selected.
              </Typography>
            )}
            <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
              {rows.length === 0 ? (
                <Box sx={{ p: 3 }}><Typography variant="body2" color="text.secondary">{d.students.length === 0 ? "No students are in this drive's departments." : "No students match."}</Typography></Box>
              ) : (
                <TableContainer sx={{ maxHeight: 560, overflow: "auto" }}>
                  <Table size="small" stickyHeader aria-label="Students and their results" sx={{ minWidth: 760 }}>
                    <TableHead>
                      <TableRow sx={headRow}>
                        <TableCell>Student</TableCell><TableCell>CGPA</TableCell><TableCell>Can apply?</TableCell>
                        <TableCell sx={{ minWidth: 150 }}>Status</TableCell>
                        {d.drive.rounds.map((r) => <TableCell key={r} sx={{ minWidth: 120 }}>{r}</TableCell>)}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((s) => {
                        const c = current(s);
                        return (
                          <TableRow key={s.id} sx={{ bgcolor: edits[s.id] ? "primaryContainer" : undefined, "& td": { borderColor: "outlineVariant", verticalAlign: "top" } }}>
                            <TableCell>
                              <Stack direction="row" spacing={0.75} alignItems="center">
                                <Typography variant="body2" fontWeight={500}>{s.name}</Typography>
                                {s.has_offer && <Chip size="small" label="Has offer" sx={{ height: 20, fontSize: typeScale.labelSmall.fontSize }} />}
                              </Stack>
                              <Typography variant="caption" color="text.secondary">{sub(s)}</Typography>
                              {s.applied_by === "staff" && <Typography variant="caption" color="text.secondary" component="div">Added by the office{s.override_reason ? `: ${s.override_reason}` : ""}</Typography>}
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">{s.cgpa ?? "—"}</Typography>
                              <Typography variant="caption" color="text.secondary">{s.backlogs == null ? "backlogs: —" : `${s.backlogs} backlog${s.backlogs === 1 ? "" : "s"}`}</Typography>
                            </TableCell>
                            <TableCell>
                              {s.eligible ? <Chip size="small" label="Yes" sx={{ height: 22, bgcolor: "successContainer", color: "onSuccessContainer", fontWeight: 600 }} /> : (
                                <Tooltip title={<Box component="ul" sx={{ m: 0, pl: 2 }}>{s.reasons.map((r) => <li key={r}>{r}</li>)}</Box>}>
                                  <Chip size="small" label={`No (${s.reasons.length})`} sx={{ height: 22, bgcolor: "surfaceContainerHigh", color: "onSurfaceVariant", fontWeight: 600 }} />
                                </Tooltip>
                              )}
                            </TableCell>
                            <TableCell>
                              {canManage ? (
                                <>
                                  <TextField select size="small" fullWidth value={c.status ?? ""} onChange={(e) => setStatus(s, (e.target.value || null) as AppStatus | null)} aria-label={`Status for ${s.name}`}>
                                    <MenuItem value="">Not applied</MenuItem>
                                    {(Object.keys(STATUS_LABEL) as AppStatus[]).map((k) => <MenuItem key={k} value={k}>{STATUS_LABEL[k]}</MenuItem>)}
                                  </TextField>
                                  {needsReason(s) && (
                                    <TextField size="small" fullWidth sx={{ mt: 1 }} label="Why is this student added?" value={c.override_reason} onChange={(e) => setReason(s, e.target.value)} required
                                      error={c.override_reason.trim().length > 0 && c.override_reason.trim().length < 10} helperText={s.reasons.join(" ")} slotProps={{ htmlInput: { maxLength: 300 } }} />
                                  )}
                                </>
                              ) : <Typography variant="body2">{s.status ? STATUS_LABEL[s.status] : "—"}</Typography>}
                            </TableCell>
                            {d.drive.rounds.map((r) => (
                              <TableCell key={r}>
                                {canManage ? (
                                  <TextField select size="small" fullWidth value={c.round_results[r] ?? ""} disabled={!c.status} onChange={(e) => setRound(s, r, e.target.value as "passed" | "failed" | "")} aria-label={`${r} result for ${s.name}`}>
                                    <MenuItem value="">—</MenuItem><MenuItem value="passed">Passed</MenuItem><MenuItem value="failed">Failed</MenuItem>
                                  </TextField>
                                ) : <Typography variant="body2">{s.round_results[r] === "passed" ? "Passed" : s.round_results[r] === "failed" ? "Failed" : "—"}</Typography>}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Card>
            {save.isError && <Alert severity="error" sx={{ mt: 2, borderRadius: radius.md }}>{apiErrorMessage(save.error, "Could not save.")}</Alert>}
            {canManage && (
              <Stack direction="row" spacing={2} alignItems="center" justifyContent="flex-end" sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary">{dirty.length ? `${dirty.length} changed${missingReason ? " · a reason is needed for the highlighted students" : ""}` : "No changes"}</Typography>
                <Button onClick={() => setEdits({})} disabled={!dirty.length || save.isPending}>Discard</Button>
                <Button variant="contained" onClick={() => save.mutate()} disabled={!dirty.length || missingReason || save.isPending}>{save.isPending ? "Saving…" : "Save results"}</Button>
              </Stack>
            )}
          </Box>
          {canManage && <NoticeDialog open={notice} onClose={() => setNotice(false)} driveId={driveId} company={d.drive.company} />}
        </Stack>
      )}
    </DataState>
  );
}
