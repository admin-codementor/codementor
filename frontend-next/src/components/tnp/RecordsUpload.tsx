"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
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
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { DataState } from "@/components/ui/DataState";
import { ListSkeleton } from "@/components/ui/Skeletons";
import { useConfirm } from "@/components/feedback/ConfirmProvider";
import { useToast } from "@/components/feedback/ToastProvider";
import { UploadFileOutlinedIcon } from "@/components/ui/icons";
import { headRow } from "@/components/faculty/DepartmentTables";
import { fmtDateTime } from "./types";

interface PlanRow { rowNo: number; rollNo: string; name: string | null; cgpa?: number; backlogs?: number; before: { cgpa: number | null; backlogs: number | null } | null; status: "new" | "changed" | "same" | "error"; error: string }
interface Plan { rows: PlanRow[]; counts: { new: number; changed: number; same: number; error: number } }
interface Batch { id: string; at_ms: number; note: string | null; applied: number; skipped: number; rolled_back: boolean }

const SUMMARY: Record<PlanRow["status"], string> = { new: "new", changed: "changed", same: "unchanged", error: "with a problem" };
const STATUS: Record<PlanRow["status"], { label: string; bg: string; fg: string }> = {
  new: { label: "New", bg: "successContainer", fg: "onSuccessContainer" },
  changed: { label: "Changed", bg: "warningContainer", fg: "onWarningContainer" },
  same: { label: "Unchanged", bg: "surfaceContainerHigh", fg: "onSurfaceVariant" },
  error: { label: "Problem", bg: "errorContainer", fg: "onErrorContainer" },
};

/** Upload a CGPA and backlog list by roll number: check it first (nothing is written), then apply, and undo an upload later if it was wrong. */
export function RecordsUpload() {
  const qc = useQueryClient();
  const showToast = useToast();
  const confirm = useConfirm();
  const [text, setText] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [note, setNote] = React.useState("");
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [checkedText, setCheckedText] = React.useState("");

  const check = useMutation({
    mutationFn: async () => (await api.post("/api/placement/records/preview", { text })).data.data as Plan,
    onSuccess: (p) => { setPlan(p); setCheckedText(text); },
    onError: () => setPlan(null),
  });
  const apply = useMutation({
    mutationFn: async () => (await api.post("/api/placement/records", { text, note: note.trim() || undefined })).data.data as { applied: number; skipped: number },
    onSuccess: (r) => {
      showToast(`Saved ${r.applied} student${r.applied === 1 ? "" : "s"}.${r.skipped ? ` ${r.skipped} row${r.skipped === 1 ? "" : "s"} left out.` : ""}`, { severity: "success" });
      setText(""); setFileName(""); setNote(""); setPlan(null);
      void qc.invalidateQueries({ queryKey: ["placement"] });
    },
  });

  const batches = useQuery<Batch[]>({ queryKey: ["placement", "batches"], queryFn: async () => (await api.get("/api/placement/records/batches")).data.data, staleTime: 30_000 });
  const undo = useMutation({
    mutationFn: async (id: string) => (await api.post(`/api/placement/records/batches/${id}/rollback`)).data.data as { restored: number; left_alone: number },
    onSuccess: (r) => {
      showToast(`Put back ${r.restored} record${r.restored === 1 ? "" : "s"}.${r.left_alone ? ` ${r.left_alone} were changed by a later upload and were left as they are.` : ""}`, { severity: "success" });
      void qc.invalidateQueries({ queryKey: ["placement"] });
    },
    onError: (e) => showToast(apiErrorMessage(e, "Could not undo this upload."), { severity: "error" }),
  });

  const readFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2_000_000) { showToast("That file is too big. A list of students should be well under 2 MB.", { severity: "error" }); return; }
    setText(await f.text()); setFileName(f.name); setPlan(null);
  };

  const stale = plan != null && checkedText !== text; // the text changed after the check
  const todo = plan ? plan.counts.new + plan.counts.changed : 0;

  return (
    <Stack spacing={3}>
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: 2.5 }}>
        <Stack spacing={2}>
          <Typography variant="subtitle1" fontWeight={600}>Upload CGPA and backlogs</Typography>
          <Typography variant="body2" color="text.secondary">
            A CSV file with a <b>Roll number</b> column and a <b>CGPA</b> and/or <b>Backlogs</b> column. A row that leaves one of them empty keeps what is stored. First <b>check</b> the file: nothing is saved until you apply it, and an upload can be undone afterwards.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
            <Button component="label" variant="outlined" startIcon={<UploadFileOutlinedIcon />}>
              Choose a CSV file
              <input hidden type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ""; }} />
            </Button>
            <Typography variant="body2" color="text.secondary">{fileName || "or paste the rows below"}</Typography>
          </Stack>
          <TextField multiline minRows={4} maxRows={10} size="small" value={text} onChange={(e) => { setText(e.target.value); setFileName(""); }} placeholder={"Roll number,CGPA,Backlogs\n22A91A0501,8.45,0"} slotProps={{ htmlInput: { "aria-label": "CSV rows", spellCheck: false, style: { fontFamily: "ui-monospace, monospace" } } }} />
          {check.isError && <Alert severity="error">{apiErrorMessage(check.error, "Could not check the file.")}</Alert>}
          <Stack direction="row" spacing={1.5}>
            <Button variant="outlined" onClick={() => check.mutate()} disabled={!text.trim() || check.isPending}>{check.isPending ? "Checking…" : "Check the file"}</Button>
          </Stack>
        </Stack>
      </Card>

      {plan && (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: 2.5 }}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
              <Typography variant="subtitle1" fontWeight={600} sx={{ mr: 1 }}>What this file would do</Typography>
              {(Object.keys(STATUS) as PlanRow["status"][]).map((k) => (
                <Chip key={k} size="small" label={`${plan.counts[k]} ${SUMMARY[k]}`} sx={{ bgcolor: STATUS[k].bg, color: STATUS[k].fg, fontWeight: 600 }} />
              ))}
            </Stack>
            {plan.counts.error > 0 && <Alert severity="warning">{plan.counts.error} row{plan.counts.error === 1 ? " has a problem and will be" : "s have problems and will be"} left out. Fix them in the file and check again, or apply the rest.</Alert>}
            <TableContainer sx={{ maxHeight: 360, border: "1px solid", borderColor: "outlineVariant", borderRadius: 2 }}>
              <Table size="small" stickyHeader aria-label="Rows of the file">
                <TableHead><TableRow sx={headRow}><TableCell>Row</TableCell><TableCell>Roll number</TableCell><TableCell>Student</TableCell><TableCell>CGPA</TableCell><TableCell>Backlogs</TableCell><TableCell>Result</TableCell></TableRow></TableHead>
                <TableBody>
                  {[...plan.rows].sort((a, b) => Number(b.status === "error") - Number(a.status === "error") || a.rowNo - b.rowNo).slice(0, 200).map((r) => (
                    <TableRow key={r.rowNo} sx={{ "& td": { borderColor: "outlineVariant" } }}>
                      <TableCell>{r.rowNo}</TableCell><TableCell>{r.rollNo || "—"}</TableCell><TableCell>{r.name ?? "—"}</TableCell>
                      <TableCell>{r.status === "error" ? "—" : `${r.before?.cgpa ?? "—"}${r.cgpa !== undefined && r.cgpa !== r.before?.cgpa ? ` → ${r.cgpa}` : ""}`}</TableCell>
                      <TableCell>{r.status === "error" ? "—" : `${r.before?.backlogs ?? "—"}${r.backlogs !== undefined && r.backlogs !== r.before?.backlogs ? ` → ${r.backlogs}` : ""}`}</TableCell>
                      <TableCell>{r.status === "error" ? <Typography variant="body2" color="error">{r.error}</Typography> : <Chip size="small" label={STATUS[r.status].label} sx={{ bgcolor: STATUS[r.status].bg, color: STATUS[r.status].fg, fontWeight: 600, height: 22 }} />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {plan.rows.length > 200 && <Typography variant="caption" color="text.secondary">Showing the first 200 rows, problems first. The whole file is applied.</Typography>}
            {stale && <Alert severity="info">You changed the text after checking. Check it again before applying.</Alert>}
            {apply.isError && <Alert severity="error">{apiErrorMessage(apply.error, "Could not save the upload.")}</Alert>}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
              <TextField size="small" label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Semester 6 results" sx={{ minWidth: 260 }} slotProps={{ htmlInput: { maxLength: 120 } }} />
              <Box sx={{ flex: 1 }} />
              <Button variant="contained" disabled={todo === 0 || stale || apply.isPending} onClick={() => apply.mutate()}>
                {apply.isPending ? "Saving…" : todo === 0 ? "Nothing to apply" : `Apply ${todo} change${todo === 1 ? "" : "s"}`}
              </Button>
            </Stack>
          </Stack>
        </Card>
      )}

      <Box>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>Earlier uploads</Typography>
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
          <DataState loading={batches.isLoading} error={batches.isError ? batches.error : undefined} onRetry={() => batches.refetch()} skeleton={<ListSkeleton rows={3} />}
            empty={(batches.data ?? []).length === 0} emptyVariant="firstUse" emptyTitle="No uploads yet" emptyDescription="Each upload is listed here, and you can undo it.">
            <Stack divider={<Box sx={{ borderTop: "1px solid", borderColor: "outlineVariant" }} />}>
              {(batches.data ?? []).map((b) => (
                <Stack key={b.id} direction="row" spacing={2} alignItems="center" sx={{ p: 2 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={500}>{fmtDateTime(new Date(b.at_ms).toISOString())}{b.note ? ` · ${b.note}` : ""}</Typography>
                    <Typography variant="caption" color="text.secondary">{b.applied} saved{b.skipped ? `, ${b.skipped} left out` : ""}{b.rolled_back ? " · undone" : ""}</Typography>
                  </Box>
                  {!b.rolled_back && (
                    <Button size="small" color="inherit" disabled={undo.isPending} onClick={async () => { if (await confirm({ title: "Undo this upload?", description: `The ${b.applied} records it saved go back to what they were before. A record that a later upload has since changed is left as it is.`, confirmLabel: "Undo upload" })) undo.mutate(b.id); }}>Undo</Button>
                  )}
                </Stack>
              ))}
            </Stack>
          </DataState>
        </Card>
      </Box>
    </Stack>
  );
}
