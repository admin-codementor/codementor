"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/components/feedback/ToastProvider";
import { DownloadOutlinedIcon } from "@/components/ui/icons";

interface Field { key: string; label: string }
interface Batch { name: string; count: number }

export const useBatches = () => useQuery<Batch[]>({ queryKey: ["faculty", "batches"], queryFn: async () => (await api.get("/api/faculty/batches")).data.data, staleTime: 5 * 60_000 });

/**
 * The department export. The fields come from a fixed list, the students are the ones in the view (and an optional batch), and every export is
 * written to the audit log with who made it, the fields and how many students.
 */
export function DepartmentExportButton({ section, year }: { section: string; year: string }) {
  const showToast = useToast();
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<string[]>(["name", "rollNo", "batch", "section", "practiceState", "codingScore"]);
  const [batch, setBatch] = React.useState("");
  const fields = useQuery<Field[]>({ queryKey: ["faculty", "export-fields"], queryFn: async () => (await api.get("/api/faculty/department-export/fields")).data.data, staleTime: 60 * 60_000, enabled: open });
  const batches = useBatches();
  const [message, setMessage] = React.useState("");

  const download = useMutation({
    mutationFn: async () => {
      const res = await api.post("/api/faculty/department-export", { fields: picked, ...(section ? { section } : {}), ...(year ? { year } : {}), ...(batch ? { batch } : {}) }, { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url; a.download = "department-export.csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    onSuccess: () => { showToast("Downloaded. The export was recorded in the audit log.", { severity: "success" }); setOpen(false); },
    onError: async (e) => {
      // The body of a failed download is a Blob too, so read the server's message out of it.
      const blob = (e as { response?: { data?: Blob } })?.response?.data;
      if (blob instanceof Blob) { try { setMessage(JSON.parse(await blob.text()).error || ""); return; } catch { /* fall through */ } }
      setMessage(apiErrorMessage(e, "The export could not be made."));
    },
  });
  const toggle = (k: string) => setPicked((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  return (
    <>
      <Button variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={() => { setOpen(true); setMessage(""); }}>Export</Button>
      <Dialog open={open} onClose={download.isPending ? undefined : () => setOpen(false)} fullWidth maxWidth="sm" aria-labelledby="dept-export-title">
        <DialogTitle id="dept-export-title">Export students</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <Alert severity="info">Every export is recorded in the audit log with who made it, the fields and how many students. Share the file only with people who need it.</Alert>
            <div>
              <Typography variant="subtitle2" fontWeight={600}>Fields</Typography>
              <FormGroup row>
                {(fields.data ?? []).map((f) => <FormControlLabel key={f.key} sx={{ minWidth: 200 }} control={<Checkbox size="small" checked={picked.includes(f.key)} onChange={() => toggle(f.key)} />} label={f.label} />)}
                {fields.isLoading && <Typography variant="caption" color="text.secondary">Loading…</Typography>}
                {fields.isError && <Typography variant="caption" color="error">Could not load the fields. Close this and try again.</Typography>}
              </FormGroup>
            </div>
            <div>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>Which students</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>The students in the current view{section || year ? ` (${[year && `year ${year}`, section && `section ${section}`].filter(Boolean).join(", ")})` : ""}. Narrow further by batch if you like.</Typography>
              <TextField select size="small" label="Batch" value={batch} onChange={(e) => setBatch(e.target.value)} sx={{ minWidth: 240 }}>
                <MenuItem value="">All batches</MenuItem>
                {(batches.data ?? []).map((b) => <MenuItem key={b.name} value={b.name}>{b.name} ({b.count} students)</MenuItem>)}
              </TextField>
            </div>
            {download.isError && <Alert severity="error">{message || "The export could not be made."}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={download.isPending}>Cancel</Button>
          <Button variant="contained" disabled={picked.length === 0 || download.isPending} onClick={() => download.mutate()}>{download.isPending ? "Preparing…" : "Download CSV"}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
