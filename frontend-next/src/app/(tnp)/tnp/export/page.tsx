"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { ListSkeleton } from "@/components/ui/Skeletons";
import { useToast } from "@/components/feedback/ToastProvider";
import { DownloadOutlinedIcon } from "@/components/ui/icons";
import { usePlacementDrives } from "@/components/tnp/DrivesList";
import { usePlacementMeta } from "@/components/tnp/types";

interface Field { key: string; label: string }

/** A file leaves the system here, so the fields are chosen from a fixed list and every export is written to the audit log. */
export default function TnpExportPage() {
  const showToast = useToast();
  const meta = usePlacementMeta();
  const drives = usePlacementDrives();
  const fields = useQuery<Field[]>({ queryKey: ["placement", "export-fields"], queryFn: async () => (await api.get("/api/placement/export/fields")).data.data, staleTime: 60 * 60_000 });
  const [picked, setPicked] = React.useState<string[]>(["name", "rollNo", "department"]);
  const [department, setDepartment] = React.useState("");
  const [year, setYear] = React.useState("");
  const [driveId, setDriveId] = React.useState("");

  const download = useMutation({
    mutationFn: async () => {
      const res = await api.post("/api/placement/export", { fields: picked, ...(department ? { department } : {}), ...(year ? { year } : {}), ...(driveId ? { drive_id: driveId } : {}) }, { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url; a.download = "placement-export.csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    onSuccess: () => showToast("Export downloaded. It was recorded in the audit log.", { severity: "success" }),
  });
  // The error body of a failed blob request is a Blob too, so read its message out of it.
  const [message, setMessage] = React.useState("");
  React.useEffect(() => {
    const e = download.error as { response?: { data?: Blob } } | null;
    if (!download.isError) { setMessage(""); return; }
    if (e?.response?.data instanceof Blob) e.response.data.text().then((t) => { try { setMessage(JSON.parse(t).error || ""); } catch { setMessage(""); } }, () => setMessage(""));
    else setMessage(apiErrorMessage(download.error, "The export could not be made."));
  }, [download.isError, download.error]);

  const toggle = (k: string) => setPicked((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  return (
    <>
      <PageHeader title="Export" subtitle="Download a spreadsheet of students for a company. Choose only the fields it needs." />
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: 2.5, maxWidth: 760 }}>
        <Stack spacing={3}>
          <Alert severity="info">Every export is recorded in the audit log with who made it, the fields, and how many students. Share the file only with the company it is for.</Alert>
          <Stack spacing={1}>
            <Typography variant="subtitle2" fontWeight={600}>Fields</Typography>
            <DataState loading={fields.isLoading} error={fields.isError ? fields.error : undefined} onRetry={() => fields.refetch()} skeleton={<ListSkeleton rows={3} />}>
              <FormGroup row>
                {(fields.data ?? []).map((f) => <FormControlLabel key={f.key} sx={{ minWidth: 190 }} control={<Checkbox size="small" checked={picked.includes(f.key)} onChange={() => toggle(f.key)} />} label={f.label} />)}
              </FormGroup>
            </DataState>
          </Stack>
          <Stack spacing={2}>
            <Typography variant="subtitle2" fontWeight={600}>Which students</Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField select size="small" label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} fullWidth>
                <MenuItem value="">Whole college</MenuItem>
                {(meta.data?.departments ?? []).map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="Year" value={year} onChange={(e) => setYear(e.target.value)} fullWidth>
                <MenuItem value="">All years</MenuItem>
                {(meta.data?.years ?? []).map((y) => <MenuItem key={y} value={String(y)}>Year {y}</MenuItem>)}
              </TextField>
            </Stack>
            <TextField select size="small" label="Only those who applied to a drive" value={driveId} onChange={(e) => setDriveId(e.target.value)} fullWidth>
              <MenuItem value="">Not limited to a drive</MenuItem>
              {(drives.data ?? []).map((d) => <MenuItem key={d.id} value={d.id}>{d.company}{d.role ? ` (${d.role})` : ""} · {d.applied} applied</MenuItem>)}
            </TextField>
          </Stack>
          {download.isError && <Alert severity="error">{message || "The export could not be made."}</Alert>}
          <Stack direction="row">
            <Button variant="contained" startIcon={<DownloadOutlinedIcon />} disabled={picked.length === 0 || download.isPending} onClick={() => download.mutate()}>
              {download.isPending ? "Preparing…" : "Download CSV"}
            </Button>
          </Stack>
        </Stack>
      </Card>
    </>
  );
}
