"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { getRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { CardGridSkeleton, ListSkeleton } from "@/components/ui/Skeletons";
import { useToast } from "@/components/feedback/ToastProvider";
import { radius } from "@/theme/tokens";
import { SchoolOutlinedIcon } from "@/components/ui/icons";
import type { AccessRequest } from "@/components/faculty/academic/types";

interface MyClass { id: string; label: string; department: string; via: string[]; mentees: boolean; subjects: string[]; students: number }
interface Directory { term: { id: string; label: string } | null; classes: { id: string; label: string; kind: string; students: number }[] }

const STATUS_LABEL: Record<AccessRequest["status"], string> = { pending: "Waiting for a decision", approved: "Approved", declined: "Declined" };

export default function MyClassesPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const canAsk = getRole() === "faculty";
  const [open, setOpen] = React.useState(false);
  const [classId, setClassId] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState("");

  const mine = useQuery<{ term: { id: string; label: string } | null; classes: MyClass[] }>({ queryKey: ["academic", "my-classes"], queryFn: async () => (await api.get("/api/academic/my-classes")).data.data });
  const directory = useQuery<Directory>({ queryKey: ["academic", "directory"], queryFn: async () => (await api.get("/api/academic/class-directory")).data.data, enabled: open });
  const requests = useQuery<AccessRequest[]>({ queryKey: ["academic", "requests"], queryFn: async () => (await api.get("/api/academic/requests")).data.data, enabled: canAsk });

  const ask = useMutation({
    mutationFn: async () => api.post("/api/academic/requests", { class_id: classId, reason }),
    onSuccess: () => { toast("Request sent. Your HOD will decide.", { severity: "success" }); setOpen(false); setClassId(""); setReason(""); void qc.invalidateQueries({ queryKey: ["academic", "requests"] }); },
    onError: (e) => setError(apiErrorMessage(e, "Couldn't send the request.")),
  });

  const classes = mine.data?.classes ?? [];
  const mineIds = new Set(classes.map((c) => c.id));
  const askable = (directory.data?.classes ?? []).filter((c) => !mineIds.has(c.id));

  return (
    <Stack>
      <PageHeader
        title="My classes"
        subtitle={mine.data?.term ? `${mine.data.term.label}: the classes you teach, look after as class teacher or sub-mentor, or have been given access to.` : "The classes you teach or look after this term."}
        actions={canAsk ? <Button variant="outlined" onClick={() => { setError(""); setOpen(true); }}>Ask for access to a class</Button> : undefined}
      />

      <DataState loading={mine.isLoading} error={mine.isError ? mine.error : undefined} onRetry={() => mine.refetch()} skeleton={<CardGridSkeleton />}
        empty={classes.length === 0} emptyVariant="unassigned" emptyTitle={mine.data?.term ? "No classes yet" : "No term is running"}
        emptyDescription={mine.data?.term ? "Your HOD gives you classes by naming you class teacher, sub-mentor or the teacher of a subject. You can also ask for access to a class you need." : "Classes appear here once an Admin starts the term and your HOD has set up the classes."}>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
          {classes.map((c) => (
            <Card key={c.id} variant="outlined" sx={{ borderColor: "outlineVariant", borderRadius: radius.md }}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center">
                  <SchoolOutlinedIcon fontSize="small" />
                  <Typography variant="subtitle1" fontWeight={600}>{c.label}</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {c.mentees ? `${c.students} students in the class; you see your own mentees` : `${c.students} students`}
                </Typography>
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
                  {c.via.map((v) => <Chip key={v} size="small" label={v} />)}
                  {c.subjects.map((s) => <Chip key={s} size="small" variant="outlined" label={s} />)}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Box>
      </DataState>

      {canAsk && (requests.data?.length ?? 0) > 0 && (
        <Stack spacing={1} sx={{ mt: 4 }}>
          <Typography variant="subtitle1" fontWeight={600}>Your access requests</Typography>
          {(requests.data ?? []).map((r) => (
            <Card key={r.id} variant="outlined" sx={{ borderColor: "outlineVariant", borderRadius: radius.md }}>
              <CardContent sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
                <Box sx={{ flex: 1, minWidth: 220 }}>
                  <Typography variant="body2" fontWeight={600}>{r.classLabel}</Typography>
                  <Typography variant="caption" color="text.secondary">{r.reason}{r.note ? ` · Reply: ${r.note}` : ""}</Typography>
                </Box>
                <Chip size="small" label={STATUS_LABEL[r.status]} color={r.status === "approved" ? "success" : "default"} />
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
      {canAsk && requests.isLoading && <ListSkeleton rows={2} />}

      <Dialog open={open} onClose={ask.isPending ? undefined : () => setOpen(false)} maxWidth="xs" fullWidth aria-labelledby="ask-title">
        <DialogTitle id="ask-title">Ask for access to a class</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">Your HOD decides, and can limit how long you have access. You can ask for classes of your department in the current term.</Typography>
            {directory.isError && <Alert severity="error">{apiErrorMessage(directory.error, "Couldn't load the classes.")}</Alert>}
            <TextField select size="small" label="Class" value={classId} onChange={(e) => setClassId(e.target.value)} disabled={directory.isLoading}>
              {askable.map((c) => <MenuItem key={c.id} value={c.id}>{c.label} ({c.students})</MenuItem>)}
            </TextField>
            <TextField size="small" multiline minRows={2} label="Why do you need it?" placeholder="Covering Python for section B this month" value={reason} onChange={(e) => setReason(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpen(false)} disabled={ask.isPending}>Cancel</Button>
          <Button variant="contained" onClick={() => { setError(""); ask.mutate(); }} disabled={ask.isPending || !classId || reason.trim().length < 5}>{ask.isPending ? "Sending…" : "Send request"}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
