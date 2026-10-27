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
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { useConfirm } from "@/components/feedback/ConfirmProvider";
import { useToast } from "@/components/feedback/ToastProvider";
import { fromLocalInput, toLocalInput, usePlacementMeta, type Drive, type Tier } from "./types";

const YEARS = [1, 2, 3, 4, 5, 6];

/** Create or edit a drive. A new drive starts as a draft that students cannot see until it is published. */
export function DriveFormDialog({ open, onClose, drive, onDeleted }: { open: boolean; onClose: () => void; drive: Drive | null; onDeleted?: () => void }) {
  const qc = useQueryClient();
  const showToast = useToast();
  const confirm = useConfirm();
  const meta = usePlacementMeta();
  const [f, setF] = React.useState({
    company: "", role: "", ctc: "", description: "", date: "", applyBy: "", link: "", minCgpa: "", maxBacklogs: "", rounds: "",
    tier: "normal" as Tier, status: "open" as "open" | "closed", publish: "draft" as "draft" | "published",
  });
  const [departments, setDepartments] = React.useState<string[]>([]);
  const [years, setYears] = React.useState<number[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setF({
      company: drive?.company ?? "", role: drive?.role ?? "", ctc: drive?.ctc ?? "", description: drive?.description ?? "", date: drive?.date ?? "",
      applyBy: toLocalInput(drive?.apply_by ?? null), link: drive?.link ?? "", minCgpa: drive?.min_cgpa != null ? String(drive.min_cgpa) : "",
      maxBacklogs: drive?.max_backlogs != null ? String(drive.max_backlogs) : "", rounds: (drive?.rounds ?? []).join(", "),
      tier: drive?.tier ?? "normal", status: drive?.status ?? "open", publish: drive?.publish_state ?? "draft",
    });
    setDepartments(drive?.departments ?? []);
    setYears(drive?.eligible_years ?? []);
  }, [open, drive]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((cur) => ({ ...cur, [k]: v }));
  const toggle = <T,>(list: T[], v: T, setList: (l: T[]) => void) => setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const body = () => ({
    company: f.company, role: f.role, ctc: f.ctc, description: f.description, date: f.date || null, apply_by: fromLocalInput(f.applyBy), link: f.link || null,
    departments, eligible_years: [...years].sort(), min_cgpa: f.minCgpa === "" ? null : Number(f.minCgpa), max_backlogs: f.maxBacklogs === "" ? null : Number(f.maxBacklogs),
    rounds: f.rounds.split(",").map((r) => r.trim()).filter(Boolean), tier: f.tier, status: f.status, publish_state: f.publish,
  });

  const save = useMutation({
    mutationFn: async () => (drive ? api.patch(`/api/placement/drives/${drive.id}`, body()) : api.post("/api/placement/drives", body())),
    onSuccess: () => {
      showToast(drive ? "Drive updated" : f.publish === "published" ? "Drive published" : "Drive saved as a draft", { severity: "success" });
      void qc.invalidateQueries({ queryKey: ["placement"] });
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: async () => api.delete(`/api/placement/drives/${drive!.id}`),
    onSuccess: () => { showToast("Drive deleted", { severity: "success" }); void qc.invalidateQueries({ queryKey: ["placement"] }); onClose(); onDeleted?.(); },
    onError: (e) => showToast(apiErrorMessage(e, "Could not delete the drive."), { severity: "error" }),
  });

  const ready = f.company.trim().length >= 2 && departments.length > 0;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby="drive-title">
      <Box component="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); if (ready) save.mutate(); }}>
        <DialogTitle id="drive-title">{drive ? "Edit drive" : "New placement drive"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField size="small" label="Company" value={f.company} onChange={(e) => set("company", e.target.value)} required autoFocus fullWidth slotProps={{ htmlInput: { maxLength: 80 } }} />
              <TextField size="small" label="Role" value={f.role} onChange={(e) => set("role", e.target.value)} fullWidth slotProps={{ htmlInput: { maxLength: 80 } }} />
              <TextField size="small" label="Package" value={f.ctc} onChange={(e) => set("ctc", e.target.value)} fullWidth placeholder="e.g. 6 LPA" slotProps={{ htmlInput: { maxLength: 40 } }} />
            </Stack>
            <TextField size="small" label="About the drive" value={f.description} onChange={(e) => set("description", e.target.value)} multiline minRows={2} maxRows={6} helperText="Shown to students: what the company does, the selection process, anything they must bring." slotProps={{ htmlInput: { maxLength: 2000 } }} />

            <Box>
              <Typography variant="subtitle2" fontWeight={600}>Who can apply</Typography>
              <Typography variant="caption" color="text.secondary">Departments (choose at least one)</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 0.5, mb: 1.5 }} flexWrap="wrap" useFlexGap>
                {(meta.data?.departments ?? []).map((d) => (
                  <Chip key={d} label={d} size="small" clickable onClick={() => toggle(departments, d, setDepartments)} color={departments.includes(d) ? "primary" : "default"} variant={departments.includes(d) ? "filled" : "outlined"} />
                ))}
                {meta.isLoading && <Typography variant="caption" color="text.secondary">Loading departments…</Typography>}
                {meta.isError && <Typography variant="caption" color="error">Could not load the departments. Close this and try again.</Typography>}
              </Stack>
              <Typography variant="caption" color="text.secondary">Years (none selected means every year)</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 0.5, mb: 1.5 }} flexWrap="wrap" useFlexGap>
                {YEARS.map((y) => (
                  <Chip key={y} label={`Year ${y}`} size="small" clickable onClick={() => toggle(years, y, setYears)} color={years.includes(y) ? "primary" : "default"} variant={years.includes(y) ? "filled" : "outlined"} />
                ))}
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField size="small" label="Minimum CGPA" type="number" value={f.minCgpa} onChange={(e) => set("minCgpa", e.target.value)} fullWidth slotProps={{ htmlInput: { min: 0, max: 10, step: 0.1 } }} helperText="Leave empty for no limit" />
                <TextField size="small" label="Most backlogs allowed" type="number" value={f.maxBacklogs} onChange={(e) => set("maxBacklogs", e.target.value)} fullWidth slotProps={{ htmlInput: { min: 0, max: 50, step: 1 } }} helperText="0 means none. Leave empty for no limit" />
                <TextField select size="small" label="Tier" value={f.tier} onChange={(e) => set("tier", e.target.value as Tier)} fullWidth helperText="A student with an offer can apply only to dream drives">
                  <MenuItem value="normal">Normal</MenuItem>
                  <MenuItem value="dream">Dream</MenuItem>
                </TextField>
              </Stack>
            </Box>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField size="small" label="Last date to apply" type="datetime-local" value={f.applyBy} onChange={(e) => set("applyBy", e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} helperText="Empty means no last date" />
              <TextField size="small" label="Drive date" type="date" value={f.date} onChange={(e) => set("date", e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
            </Stack>
            <TextField size="small" label="Company link (optional)" value={f.link} onChange={(e) => set("link", e.target.value)} placeholder="https://" helperText="Students who must also apply on the company's own site get this link. Must start with https://" slotProps={{ htmlInput: { maxLength: 400 } }} />
            <TextField size="small" label="Rounds, in order" value={f.rounds} onChange={(e) => set("rounds", e.target.value)} placeholder="Aptitude, Technical, HR" helperText="Comma separated, up to 8. You record a pass or fail for each round later." />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField select size="small" label="Visibility" value={f.publish} onChange={(e) => set("publish", e.target.value as "draft" | "published")} fullWidth helperText={f.publish === "draft" ? "Students cannot see a draft." : "Students of the chosen departments can see it and apply."}>
                <MenuItem value="draft">Draft</MenuItem>
                <MenuItem value="published">Published</MenuItem>
              </TextField>
              <TextField select size="small" label="Applications" value={f.status} onChange={(e) => set("status", e.target.value as "open" | "closed")} fullWidth helperText={f.status === "closed" ? "Nobody can apply, not even with an override." : undefined}>
                <MenuItem value="open">Open</MenuItem>
                <MenuItem value="closed">Closed</MenuItem>
              </TextField>
            </Stack>
            {save.isError && <Alert severity="error">{apiErrorMessage(save.error, "Could not save the drive.")}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          {drive && (
            <Button
              color="error" sx={{ mr: "auto" }} disabled={remove.isPending}
              onClick={async () => { if (await confirm({ title: "Delete this drive?", description: "Every student's application and result for it is deleted too. This cannot be undone. To stop applications without deleting, close it instead.", destructive: true, confirmLabel: "Delete" })) remove.mutate(); }}
            >
              Delete drive
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!ready || save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
