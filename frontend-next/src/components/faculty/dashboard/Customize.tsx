"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { ExpandLessIcon, ExpandMoreIcon } from "@/components/ui/icons";
import { useToast } from "@/components/feedback/ToastProvider";

export interface WidgetState { id: string; visible: boolean }
export interface LayoutResponse {
  layout: { preset: string | null; widgets: WidgetState[] };
  registry: { id: string; title: string; description: string }[];
  presets: { id: string; title: string; widgets: WidgetState[] }[];
}

export const layoutKey = ["faculty", "dashboard-layout"] as const;

/** The saved layout. While it loads or if it fails, nothing is hidden and the page uses the order in the code (the dashboard never breaks over it). */
export function useDashboardLayout() {
  return useQuery<LayoutResponse>({
    queryKey: layoutKey,
    queryFn: async () => (await api.get("/api/faculty/dashboard-layout")).data.data,
    staleTime: 10 * 60_000,
  });
}

export function CustomizeDialog({ open, onClose, data }: { open: boolean; onClose: () => void; data: LayoutResponse | undefined }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [rows, setRows] = React.useState<WidgetState[]>([]);
  const [error, setError] = React.useState("");
  React.useEffect(() => { if (open && data) { setRows(data.layout.widgets.map((w) => ({ ...w }))); setError(""); } }, [open, data]);

  const titleOf = (id: string) => data?.registry.find((w) => w.id === id)?.title ?? id;
  const descOf = (id: string) => data?.registry.find((w) => w.id === id)?.description ?? "";
  const move = (i: number, d: -1 | 1) => setRows((r) => { const j = i + d; if (j < 0 || j >= r.length) return r; const n = [...r]; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const save = useMutation({
    mutationFn: async (body: { widgets: WidgetState[] } | { preset: string }) => (await api.put("/api/faculty/dashboard-layout", body)).data.data as { layout: LayoutResponse["layout"] },
    onSuccess: (r) => {
      qc.setQueryData<LayoutResponse>(layoutKey, (old) => (old ? { ...old, layout: r.layout } : old));
      toast("Dashboard saved.", { severity: "success" });
      onClose();
    },
    onError: (e) => setError(apiErrorMessage(e, "Couldn't save your dashboard.")),
  });

  return (
    <Dialog open={open} onClose={save.isPending ? undefined : onClose} maxWidth="sm" fullWidth aria-labelledby="custom-title">
      <DialogTitle id="custom-title">Customise your dashboard</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">Choose what to show and in what order. This is saved for you and follows you to any computer.</Typography>
          <TextField select size="small" label="Start from" value="" onChange={(e) => { const p = data?.presets.find((x) => x.id === e.target.value); if (p) setRows(p.widgets.map((w) => ({ ...w }))); }} helperText="Replaces the list below until you save.">
            {(data?.presets ?? []).map((p) => <MenuItem key={p.id} value={p.id}>{p.title}</MenuItem>)}
          </TextField>
          <Stack component="ul" spacing={1} sx={{ m: 0, p: 0, listStyle: "none" }} aria-label="Widgets">
            {rows.map((w, i) => (
              <Stack component="li" key={w.id} direction="row" spacing={1} alignItems="center" sx={{ p: 1, border: "1px solid", borderColor: "outlineVariant", borderRadius: 2 }}>
                <Switch checked={w.visible} onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, visible: e.target.checked } : x)))} slotProps={{ input: { "aria-label": `Show ${titleOf(w.id)}` } }} />
                <Stack sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600}>{titleOf(w.id)}</Typography>
                  <Typography variant="caption" color="text.secondary">{descOf(w.id)}</Typography>
                </Stack>
                <IconButton size="small" aria-label={`Move ${titleOf(w.id)} up`} onClick={() => move(i, -1)} disabled={i === 0}><ExpandLessIcon fontSize="small" /></IconButton>
                <IconButton size="small" aria-label={`Move ${titleOf(w.id)} down`} onClick={() => move(i, 1)} disabled={i === rows.length - 1}><ExpandMoreIcon fontSize="small" /></IconButton>
              </Stack>
            ))}
          </Stack>
          {rows.length > 0 && rows.every((r) => !r.visible) && <Alert severity="info">Everything is hidden, so the dashboard will be empty apart from the class choice.</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={() => save.mutate({ preset: "default" })} disabled={save.isPending} color="inherit">Reset to everything</Button>
        <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button variant="contained" onClick={() => { setError(""); save.mutate({ widgets: rows }); }} disabled={save.isPending || rows.length === 0}>{save.isPending ? "Saving…" : "Save"}</Button>
      </DialogActions>
    </Dialog>
  );
}
