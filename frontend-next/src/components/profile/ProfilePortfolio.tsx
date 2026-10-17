"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { useConfirm } from "@/components/feedback/ConfirmProvider";
import { useToast } from "@/components/feedback/ToastProvider";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SectionCard } from "@/components/ui/SectionCard";
import { AddIcon, DeleteOutlineIcon, EditOutlinedIcon, InboxIcon } from "@/components/ui/icons";
import { radius } from "@/theme/tokens";

type ItemType = "certification" | "project" | "achievement";
interface Item { id: string; type: ItemType; title: string; detail: string; date: string | null; link: string | null }

const TYPES: { value: ItemType; label: string; plural: string; hint: string }[] = [
  { value: "certification", label: "Certification", plural: "Certifications", hint: "A course or exam you completed, e.g. AWS Cloud Practitioner" },
  { value: "project", label: "Project", plural: "Projects", hint: "Something you built, e.g. a college-bus tracking app" },
  { value: "achievement", label: "Achievement", plural: "Achievements", hint: "A win or recognition, e.g. hackathon finalist" },
];

function ItemDialog({ open, onClose, item, defaultType }: { open: boolean; onClose: () => void; item: Item | null; defaultType: ItemType }) {
  const qc = useQueryClient();
  const showToast = useToast();
  const [type, setType] = React.useState<ItemType>(defaultType);
  const [title, setTitle] = React.useState("");
  const [detail, setDetail] = React.useState("");
  const [date, setDate] = React.useState("");
  const [link, setLink] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setType(item?.type ?? defaultType);
    setTitle(item?.title ?? "");
    setDetail(item?.detail ?? "");
    setDate(item?.date ?? "");
    setLink(item?.link ?? "");
  }, [open, item, defaultType]);

  const save = useMutation({
    mutationFn: async () => {
      const body = { type, title, detail, date: date || null, link: link || null };
      return item ? api.patch(`/api/student/portfolio/${item.id}`, body) : api.post("/api/student/portfolio", body);
    },
    onSuccess: () => {
      showToast(item ? "Entry updated" : "Entry added", { severity: "success" });
      qc.invalidateQueries({ queryKey: ["student", "portfolio"] });
      onClose();
    },
  });

  const hint = TYPES.find((t) => t.value === type)?.hint;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="portfolio-title">
      <Box component="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); if (title.trim().length >= 2) save.mutate(); }}>
        <DialogTitle id="portfolio-title">{item ? "Edit entry" : "Add to your portfolio"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField select size="small" label="Type" value={type} onChange={(e) => setType(e.target.value as ItemType)} disabled={!!item} helperText={hint}>
              {TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </TextField>
            <TextField size="small" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus slotProps={{ htmlInput: { maxLength: 120 } }} />
            <TextField size="small" label="Details (optional)" value={detail} onChange={(e) => setDetail(e.target.value)} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 500 } }} helperText="Who issued it, what you built, what you learned" />
            <TextField
              size="small" label="Date (optional)" type="date" value={date} onChange={(e) => setDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField size="small" label="Link (optional)" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" helperText="A certificate, repository or demo link" />
            {save.isError && <Alert severity="error">{apiErrorMessage(save.error, "Could not save the entry.")}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={title.trim().length < 2 || save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

/** A student's certifications, projects and achievements. Visible to their faculty and HOD, not on the public profile. */
export function ProfilePortfolio() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const showToast = useToast();
  const [editing, setEditing] = React.useState<{ item: Item | null; type: ItemType } | null>(null);

  const query = useQuery<Item[]>({
    queryKey: ["student", "portfolio"],
    queryFn: async () => (await api.get("/api/student/portfolio")).data.data,
    staleTime: 30_000,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/student/portfolio/${id}`),
    onSuccess: () => { showToast("Entry deleted", { severity: "success" }); qc.invalidateQueries({ queryKey: ["student", "portfolio"] }); },
    onError: (e) => showToast(apiErrorMessage(e, "Could not delete the entry."), { severity: "error" }),
  });

  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.isLoading) return <Stack spacing={2}><Skeleton variant="rounded" height={120} /><Skeleton variant="rounded" height={120} /></Stack>;

  const items = query.data ?? [];

  return (
    <Stack spacing={2.5}>
      <Alert severity="info" variant="outlined">
        Your faculty and department head can see this list to understand your work beyond problem solving. It is not
        shown on your public profile.
      </Alert>

      {items.length === 0 && (
        <EmptyState
          icon={<InboxIcon />} title="Nothing here yet"
          description="Add a certification, a project or an achievement. Even one of each makes your profile much stronger."
          action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ item: null, type: "certification" })}>Add your first entry</Button>}
        />
      )}

      {items.length > 0 && TYPES.map((t) => {
        const rows = items.filter((i) => i.type === t.value);
        return (
          <SectionCard
            key={t.value}
            title={`${t.plural} (${rows.length})`}
            action={<Button size="small" startIcon={<AddIcon />} onClick={() => setEditing({ item: null, type: t.value })}>Add</Button>}
          >
            {rows.length === 0 ? (
              <Typography variant="body2" color="text.secondary">{t.hint}.</Typography>
            ) : (
              <Stack spacing={1.5}>
                {rows.map((i) => (
                  <Stack
                    key={i.id} direction="row" spacing={1} alignItems="flex-start"
                    sx={{ p: 1.5, border: "1px solid", borderColor: "outlineVariant", borderRadius: radius.md }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600}>{i.title}</Typography>
                      {i.detail && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{i.detail}</Typography>}
                      <Stack direction="row" spacing={1.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                        {i.date && <Typography variant="caption" color="text.secondary">{new Date(`${i.date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</Typography>}
                        {i.link && <Link href={i.link} target="_blank" rel="noopener noreferrer" variant="caption">View link</Link>}
                      </Stack>
                    </Box>
                    <Tooltip title="Edit"><IconButton size="small" aria-label={`Edit ${i.title}`} onClick={() => setEditing({ item: i, type: i.type })}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small" aria-label={`Delete ${i.title}`}
                        onClick={async () => {
                          if (await confirm({ title: "Delete this entry?", description: `"${i.title}" will be removed from your portfolio.`, destructive: true, confirmLabel: "Delete" })) remove.mutate(i.id);
                        }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                ))}
              </Stack>
            )}
          </SectionCard>
        );
      })}

      <ItemDialog open={!!editing} onClose={() => setEditing(null)} item={editing?.item ?? null} defaultType={editing?.type ?? "certification"} />
    </Stack>
  );
}
