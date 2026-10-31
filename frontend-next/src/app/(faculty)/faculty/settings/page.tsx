"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { ListSkeleton } from "@/components/ui/Skeletons";
import { useToast } from "@/components/feedback/ToastProvider";
import { AddIcon } from "@/components/ui/icons";
import { useSettings, type Settings } from "@/components/admin/types";

/** An editable list of names. Adding and removing happens here; nothing is saved until the card's Save is pressed. */
function NameList({ title, help, items, onChange, placeholder, max }: { title: string; help: string; items: string[]; onChange: (v: string[]) => void; placeholder: string; max: number }) {
  const [draft, setDraft] = React.useState("");
  const add = () => {
    const v = draft.replace(/\s+/g, " ").trim();
    if (!v || items.some((x) => x.toLowerCase() === v.toLowerCase())) { setDraft(""); return; }
    onChange([...items, v]); setDraft("");
  };
  return (
    <Stack spacing={1.5}>
      <div><Typography variant="subtitle1" fontWeight={600}>{title}</Typography><Typography variant="body2" color="text.secondary">{help}</Typography></div>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ minHeight: 32 }}>
        {items.length === 0 && <Typography variant="body2" color="text.secondary">None yet.</Typography>}
        {items.map((x) => <Chip key={x} label={x} onDelete={() => onChange(items.filter((y) => y !== x))} />)}
      </Stack>
      <Stack direction="row" spacing={1}>
        <TextField size="small" label="Add" placeholder={placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} slotProps={{ htmlInput: { maxLength: max } }} />
        <Button startIcon={<AddIcon />} onClick={add} disabled={!draft.trim()}>Add</Button>
      </Stack>
    </Stack>
  );
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const showToast = useToast();
  const query = useSettings();
  const [draft, setDraft] = React.useState<Settings | null>(null);
  const [limit, setLimit] = React.useState("");
  React.useEffect(() => { if (query.data) { setDraft(query.data); setLimit(query.data.ai.dailyLimit != null ? String(query.data.ai.dailyLimit) : ""); } }, [query.data]);

  const save = useMutation({
    mutationFn: async (body: Partial<Settings> | { ai: { enabled?: boolean; dailyLimit?: number | null } }) => (await api.put("/api/admin/settings", body)).data.data as Settings,
    onSuccess: (s) => { qc.setQueryData(["admin", "settings"], s); showToast("Saved. The change is in the audit log.", { severity: "success" }); },
  });
  const d = draft;
  const listsChanged = !!d && !!query.data && (JSON.stringify(d.departments) !== JSON.stringify(query.data.departments) || JSON.stringify(d.sections) !== JSON.stringify(query.data.sections));
  const limitValue = limit.trim() === "" ? null : Number(limit);
  const aiLimitChanged = !!query.data && limitValue !== query.data.ai.dailyLimit;
  const limitBad = limitValue !== null && (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 1000);

  return (
    <>
      <PageHeader title="College settings" subtitle="Changes apply to everyone, and each one is written to the audit log with the old and new value." />
      <DataState loading={query.isLoading} error={query.isError ? query.error : undefined} onRetry={() => query.refetch()} skeleton={<ListSkeleton rows={4} />}>
        {d && (
          <Stack spacing={3} sx={{ maxWidth: 760 }}>
            <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: 2.5 }}>
              <Stack spacing={3}>
                <NameList title="Departments" help="The names used when you add a faculty member or an HOD, so a typo cannot start a new department." items={d.departments} onChange={(v) => setDraft({ ...d, departments: v })} placeholder="e.g. CSE(AIML)" max={60} />
                <NameList title="Sections" help="The section letters your classes use." items={d.sections} onChange={(v) => setDraft({ ...d, sections: v })} placeholder="e.g. A" max={10} />
                {save.isError && <Alert severity="error">{apiErrorMessage(save.error, "Could not save.")}</Alert>}
                <Stack direction="row" spacing={1}>
                  <Button variant="contained" disabled={!listsChanged || save.isPending} onClick={() => save.mutate({ departments: d.departments, sections: d.sections })}>{save.isPending ? "Saving…" : "Save the lists"}</Button>
                  <Button disabled={!listsChanged || save.isPending} onClick={() => setDraft(query.data ?? d)}>Discard</Button>
                </Stack>
                {d.departments.length === 0 && <Alert severity="info">With no departments listed, any department name is accepted when you add someone. Add yours here to stop typos.</Alert>}
              </Stack>
            </Card>

            <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: 2.5 }}>
              <Stack spacing={2}>
                <div><Typography variant="subtitle1" fontWeight={600}>AI help</Typography><Typography variant="body2" color="text.secondary">The AI tutor, code review, mock interview and the HOD department insights. Switching it off stops all of them at once.</Typography></div>
                <FormControlLabel control={<Switch checked={d.ai.enabled} onChange={(e) => { setDraft({ ...d, ai: { ...d.ai, enabled: e.target.checked } }); save.mutate({ ai: { enabled: e.target.checked } }); }} disabled={save.isPending} />} label={d.ai.enabled ? "AI help is on" : "AI help is off for everyone"} />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "flex-start" }}>
                  <TextField size="small" label="Questions per person per day" value={limit} onChange={(e) => setLimit(e.target.value)} error={limitBad} helperText={limitBad ? "A whole number from 1 to 1000, or empty for no limit." : "Empty means no limit. Admins are never limited. The day ends at midnight, India time."} sx={{ width: 280 }} />
                  <Button variant="outlined" disabled={!aiLimitChanged || limitBad || save.isPending} onClick={() => save.mutate({ ai: { dailyLimit: limitValue } })}>Save the limit</Button>
                </Stack>
              </Stack>
            </Card>
          </Stack>
        )}
      </DataState>
    </>
  );
}
