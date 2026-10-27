"use client";

import * as React from "react";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import Alert from "@mui/material/Alert";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Link from "@mui/material/Link";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/States";
import { useToast } from "@/components/feedback/ToastProvider";
import { ChevronRightIcon, GroupsOutlinedIcon, RefreshIcon } from "@/components/ui/icons";
import { mmss } from "@/hooks/useExamTimer";

type RosterState = "in_progress" | "locked" | "expired" | "submitted" | "auto_submitted";
interface RosterRow {
  userId: string; name: string; rollNo: string | null; section: string | null;
  startedAt: string | null; lastSaveAt: string | null;
  state: RosterState; secondsLeft: number | null;
  submitted: boolean; autoSubmitted: boolean; locked: { reason: string; count: number | null } | null;
  answered: number; violationCount: number; reopenCount: number;
  score: number | null; total: number | null;
}
interface RosterData {
  exam: { id: string; title: string; window_end: string | null; duration_minutes: number; violation_limit: number };
  counts: { total: number; in_progress: number; locked: number; expired: number; submitted: number; auto_submitted: number };
  rows: RosterRow[];
  can_resume: boolean;
  server_time: string;
}

const STATE_LABEL: Record<RosterState, string> = {
  in_progress: "In progress", locked: "Paused", expired: "Time ran out", submitted: "Submitted", auto_submitted: "Submitted when time ran out",
};
const STATE_STYLE: Record<RosterState, { bg: string; fg: string }> = {
  in_progress: { bg: "primaryContainer", fg: "onPrimaryContainer" },
  locked: { bg: "warningContainer", fg: "onWarningContainer" },
  expired: { bg: "errorContainer", fg: "onErrorContainer" },
  submitted: { bg: "successContainer", fg: "onSuccessContainer" },
  auto_submitted: { bg: "surfaceContainerHigh", fg: "onSurfaceVariant" },
};
type Filter = "all" | "attention" | "in_progress" | "done";

const ago = (iso: string | null, nowMs: number) => {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
};

export default function ExamRosterPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [target, setTarget] = React.useState<RosterRow | null>(null);
  const [reason, setReason] = React.useState("");
  const [extra, setExtra] = React.useState(0);
  const [saving, setSaving] = React.useState(false);

  // Refreshes every 10 seconds; the server holds the answer for 10 seconds, so any number of open staff screens cost one read.
  const query = useQuery<RosterData>({
    queryKey: ["faculty", "exam-roster", id],
    queryFn: async () => (await api.get(`/api/exams/${id}/roster`)).data.data,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
  const d = query.data;
  const nowMs = d ? new Date(d.server_time).getTime() : 0;

  const rows = React.useMemo(() => {
    const all = d?.rows ?? [];
    if (filter === "attention") return all.filter((r) => r.state === "locked" || r.state === "expired");
    if (filter === "in_progress") return all.filter((r) => r.state === "in_progress");
    if (filter === "done") return all.filter((r) => r.state === "submitted" || r.state === "auto_submitted");
    return all;
  }, [d, filter]);

  const closeDialog = () => { if (!saving) { setTarget(null); setReason(""); setExtra(0); } };

  const resume = async () => {
    if (!target) return;
    setSaving(true);
    try {
      await api.post(`/api/exams/${id}/attempts/${target.userId}/reopen`, { reason: reason.trim(), extra_minutes: extra });
      toast(`${target.name} can continue. They were told.`, { severity: "success" });
      setSaving(false);
      setTarget(null); setReason(""); setExtra(0);
      void qc.invalidateQueries({ queryKey: ["faculty", "exam-roster", id] });
    } catch (e) {
      setSaving(false);
      toast(apiErrorMessage(e, "Couldn't resume this student."), { severity: "error" });
    }
  };

  const reasonOk = reason.trim().length >= 5;

  return (
    <Stack>
      <Breadcrumbs separator={<ChevronRightIcon fontSize="small" sx={{ color: "text.disabled" }} />} sx={{ mb: 1.5 }}>
        <Link component={NextLink} href="/faculty/exams" underline="hover" color="text.secondary">Exams</Link>
        <Typography variant="body2" color="text.primary" fontWeight={600}>Live roster</Typography>
      </Breadcrumbs>

      <PageHeader
        title={d?.exam.title ?? "Live roster"}
        subtitle={d ? `${d.counts.total} started · refreshes every 10 seconds · pauses after ${d.exam.violation_limit === 0 ? "never" : `${d.exam.violation_limit} violations`}` : undefined}
        actions={<Button startIcon={<RefreshIcon />} onClick={() => query.refetch()} disabled={query.isFetching}>Refresh</Button>}
      />

      {query.isError ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => query.refetch()}>Retry</Button>}>
          {apiErrorMessage(query.error, "Couldn't load the roster.")}
        </Alert>
      ) : query.isLoading ? (
        <Stack spacing={2}><Skeleton variant="rounded" height={60} /><Skeleton variant="rounded" height={320} /></Stack>
      ) : !d ? null : (
        <>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }} aria-label="Totals">
            <Chip label={`In progress ${d.counts.in_progress}`} />
            <Chip label={`Paused ${d.counts.locked}`} color={d.counts.locked ? "warning" : "default"} />
            <Chip label={`Time ran out ${d.counts.expired}`} color={d.counts.expired ? "error" : "default"} />
            <Chip label={`Submitted ${d.counts.submitted + d.counts.auto_submitted}`} />
          </Stack>

          {!d.can_resume && (
            <Alert severity="info" sx={{ mb: 2 }}>You can watch this exam. Only an Admin, the exam&apos;s owner or the owner&apos;s HOD can resume a student.</Alert>
          )}

          <ToggleButtonGroup exclusive size="small" value={filter} onChange={(_, v: Filter | null) => { if (v) setFilter(v); }} aria-label="Filter students" sx={{ mb: 2, alignSelf: "flex-start" }}>
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="attention">Needs attention</ToggleButton>
            <ToggleButton value="in_progress">In progress</ToggleButton>
            <ToggleButton value="done">Done</ToggleButton>
          </ToggleButtonGroup>

          {rows.length === 0 ? (
            <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
              <EmptyState icon={<GroupsOutlinedIcon />} title={d.rows.length === 0 ? "Nobody has started yet" : "No one in this view"} description={d.rows.length === 0 ? "Students appear here the moment they start the exam." : "Try another filter."} />
            </Card>
          ) : (
            <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
              <TableContainer sx={{ overflowX: "auto" }}>
                <Table size="small" aria-label="Students in this exam">
                  <TableHead>
                    <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600, borderColor: "outlineVariant" } }}>
                      <TableCell>Student</TableCell>
                      <TableCell>State</TableCell>
                      <TableCell align="right">Time left</TableCell>
                      <TableCell align="right">Answered</TableCell>
                      <TableCell align="right">Violations</TableCell>
                      <TableCell>Last saved</TableCell>
                      <TableCell align="right">Score</TableCell>
                      <TableCell align="right"><span style={{ position: "absolute", left: -9999 }}>Actions</span></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((r) => {
                      const st = STATE_STYLE[r.state];
                      const canAct = d.can_resume && (r.state === "locked" || r.state === "expired" || r.state === "submitted" || r.state === "auto_submitted");
                      return (
                        <TableRow key={r.userId} sx={{ "& td": { borderColor: "outlineVariant" } }}>
                          <TableCell>
                            <Typography variant="body2" fontWeight={500}>{r.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{[r.rollNo, r.section].filter(Boolean).join(" · ")}</Typography>
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={STATE_LABEL[r.state]} sx={{ bgcolor: st.bg, color: st.fg }} />
                            {r.reopenCount > 0 && <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Resumed {r.reopenCount}×</Typography>}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{r.secondsLeft != null ? mmss(r.secondsLeft) : "—"}</TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{r.answered}</TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{r.violationCount}</TableCell>
                          <TableCell><Typography variant="caption" color="text.secondary">{ago(r.lastSaveAt, nowMs)}</Typography></TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>{r.score != null ? `${r.score}${r.total ? ` / ${r.total}` : ""}` : "—"}</TableCell>
                          <TableCell align="right">
                            {canAct && <Button size="small" variant="outlined" onClick={() => { setTarget(r); setExtra(r.state === "expired" ? 10 : 0); }}>Resume</Button>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          )}
        </>
      )}

      <Dialog open={!!target} onClose={closeDialog} maxWidth="xs" fullWidth aria-labelledby="resume-title">
        <DialogTitle id="resume-title">Resume {target?.name}?</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            They can open the exam again and carry on with the answers they already saved. The reason, who resumed them and what the attempt looked like before are kept on the record. They are told.
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Reason" required multiline minRows={2} fullWidth size="small" value={reason} onChange={(e) => setReason(e.target.value)}
              helperText="For example: power cut in lab 2. At least 5 characters." slotProps={{ htmlInput: { maxLength: 300 } }} autoFocus
            />
            <TextField
              label="Extra minutes" type="number" size="small" value={extra} onChange={(e) => setExtra(Math.max(0, parseInt(e.target.value) || 0))}
              helperText="Added to the time they have left. 0 for none." slotProps={{ htmlInput: { min: 0, max: 180 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={closeDialog} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={resume} disabled={!reasonOk || saving}>{saving ? "Resuming…" : "Resume student"}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
