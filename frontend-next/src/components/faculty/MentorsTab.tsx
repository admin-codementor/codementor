"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
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
import { ExportButton, toCsv } from "@/components/analytics";
import { useToast } from "@/components/feedback/ToastProvider";
import { EmptyState } from "@/components/ui/States";
import { SearchField } from "@/components/ui/SearchField";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { GroupsOutlinedIcon } from "@/components/ui/icons";
import { radius, typeScale } from "@/theme/tokens";
import { MEDAL, headRow, type DeptStudent } from "./DepartmentTables";

interface MentorRow {
  id: string; name: string; mentees: number; solved_per_mentee: number;
  active_pct: number; needs_attention_pct: number; rank: number | null;
}
interface MentorBoard { period: "monthly" | "overall"; mentors: MentorRow[]; unassigned_students: number; total_students: number }
type Period = "monthly" | "overall";
const PERIODS = [{ value: "overall" as const, label: "Overall" }, { value: "monthly" as const, label: "Last 30 days" }];
const NO_MENTOR = "__none__";

/** Choose students and give them a mentor (or take their mentor away). */
function AssignDialog({ open, onClose, mentors, students, initialMentor }: {
  open: boolean; onClose: () => void; mentors: MentorRow[]; students: DeptStudent[]; initialMentor: string;
}) {
  const qc = useQueryClient();
  const showToast = useToast();
  const [mentor, setMentor] = React.useState(initialMentor);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [q, setQ] = React.useState("");
  const [unassignedOnly, setUnassignedOnly] = React.useState(false);

  React.useEffect(() => {
    if (open) { setMentor(initialMentor); setPicked(new Set()); setQ(""); setUnassignedOnly(false); }
  }, [open, initialMentor]);

  const shown = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return students.filter((s) => (!unassignedOnly || !s.mentor_id)
      && (!needle || `${s.name} ${s.roll_no ?? ""} ${s.section ?? ""}`.toLowerCase().includes(needle)));
  }, [students, q, unassignedOnly]);

  const save = useMutation({
    mutationFn: async () => (await api.put("/api/faculty/mentors/assign", {
      mentor_id: mentor === NO_MENTOR ? null : mentor, student_ids: [...picked],
    })).data.data as { updated: number },
    onSuccess: (r) => {
      showToast(mentor === NO_MENTOR ? `Removed the mentor from ${r.updated} student(s)` : `Assigned ${r.updated} student(s)`, { severity: "success" });
      qc.invalidateQueries({ queryKey: ["faculty"] });
      onClose();
    },
  });

  const toggle = (id: string) => setPicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShownPicked = shown.length > 0 && shown.every((s) => picked.has(s.id));

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="assign-title">
      <DialogTitle id="assign-title">Assign students to a mentor</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField select size="small" label="Mentor" value={mentor} onChange={(e) => setMentor(e.target.value)} fullWidth>
            <MenuItem value="" disabled>Choose a mentor…</MenuItem>
            <MenuItem value={NO_MENTOR}>No mentor (remove the current one)</MenuItem>
            {mentors.map((m) => <MenuItem key={m.id} value={m.id}>{m.name} ({m.mentees} mentees)</MenuItem>)}
          </TextField>
          <Stack direction="row" spacing={1} alignItems="center">
            <SearchField value={q} onChange={setQ} placeholder="Search students" label="Search students" sx={{ flex: 1 }} />
            <Chip
              label="Unassigned only" size="small" clickable
              color={unassignedOnly ? "primary" : "default"} variant={unassignedOnly ? "filled" : "outlined"}
              onClick={() => setUnassignedOnly((v) => !v)}
            />
          </Stack>
          <Box sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: radius.md, maxHeight: 320, overflowY: "auto" }}>
            {shown.length === 0 ? (
              <EmptyState compact icon={<GroupsOutlinedIcon />} title="No students match" />
            ) : (
              <>
                <Stack
                  direction="row" alignItems="center" spacing={1} onClick={() => setPicked((cur) => { const n = new Set(cur); shown.forEach((s) => (allShownPicked ? n.delete(s.id) : n.add(s.id))); return n; })}
                  sx={{ px: 1, py: 0.5, cursor: "pointer", borderBottom: "1px solid", borderColor: "outlineVariant", bgcolor: "surfaceContainerLow" }}
                >
                  <Checkbox size="small" checked={allShownPicked} tabIndex={-1} />
                  <Typography variant="body2" fontWeight={600}>Select all {shown.length} shown</Typography>
                </Stack>
                {shown.map((s) => (
                  <Stack
                    key={s.id} direction="row" alignItems="center" spacing={1} onClick={() => toggle(s.id)}
                    sx={{ px: 1, py: 0.5, cursor: "pointer", borderBottom: "1px solid", borderColor: "outlineVariant", "&:last-of-type": { borderBottom: 0 }, bgcolor: picked.has(s.id) ? "primaryContainer" : "transparent" }}
                  >
                    <Checkbox size="small" checked={picked.has(s.id)} tabIndex={-1} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap>{s.name}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {[s.roll_no, s.section && `Sec ${s.section}`].filter(Boolean).join(" · ")}
                      </Typography>
                    </Box>
                    <Chip
                      size="small" variant="outlined" label={s.mentor_name ?? (s.mentor_id ? "Other mentor" : "No mentor")}
                      sx={{ height: 20, fontSize: typeScale.labelSmall.fontSize, borderColor: "outlineVariant" }}
                    />
                  </Stack>
                ))}
              </>
            )}
          </Box>
          {save.isError && <Alert severity="error">{apiErrorMessage(save.error, "Could not save the assignment.")}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, pl: 1 }}>{picked.size} selected</Typography>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => save.mutate()} disabled={!mentor || picked.size === 0 || save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Who mentors whom, how each mentor's group is doing, and where to change it. */
export function MentorsTab() {
  const [period, setPeriod] = React.useState<Period>("overall");
  const [assign, setAssign] = React.useState<{ mentor: string } | null>(null);

  const board = useQuery<MentorBoard>({
    queryKey: ["faculty", "mentors", period],
    queryFn: async () => (await api.get("/api/faculty/mentors", { params: { period } })).data.data,
    staleTime: 30_000,
  });
  // The whole department, regardless of the dashboard's filters, so any student can be assigned.
  const roster = useQuery<{ students: DeptStudent[] }>({
    queryKey: ["faculty", "department", "", "", ""],
    queryFn: async () => (await api.get("/api/faculty/department")).data.data,
    staleTime: 30_000,
  });

  const d = board.data;
  const csv = () => toCsv((d?.mentors ?? []).map((m) => ({
    rank: m.rank ?? "", mentor: m.name, mentees: m.mentees, solved_per_mentee: m.solved_per_mentee,
    active_last_7_days_pct: m.active_pct, needs_attention_pct: m.needs_attention_pct,
  })));

  if (board.isError) {
    return (
      <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => board.refetch()}>Retry</Button>}>
        {apiErrorMessage(board.error, "Could not load mentors.")}
      </Alert>
    );
  }
  if (board.isLoading || !d) return <Skeleton variant="rounded" height={280} />;

  return (
    <Box>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          Mentors ranked by how their mentees are doing: problems solved per mentee, then how many were active in the
          last 7 days. {d.unassigned_students > 0 ? `${d.unassigned_students} of ${d.total_students} students have no mentor yet.` : "Every student has a mentor."}
        </Typography>
        <SegmentedButtons<Period> value={period} onChange={setPeriod} segments={PERIODS} ariaLabel="Period" />
        <Button variant="contained" onClick={() => setAssign({ mentor: "" })} disabled={!roster.data}>Assign students</Button>
        <ExportButton filename="mentor-leaderboard.csv" csv={csv} disabled={d.mentors.length === 0} />
      </Stack>

      <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
        {d.mentors.length === 0 ? (
          <EmptyState
            compact icon={<GroupsOutlinedIcon />} title="No mentors in this department"
            description="Faculty in your department appear here once their accounts have a department set."
          />
        ) : (
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small" aria-label="Mentor leaderboard" sx={{ minWidth: 680 }}>
              <TableHead>
                <TableRow sx={headRow}>
                  <TableCell>Rank</TableCell>
                  <TableCell>Mentor</TableCell>
                  <TableCell align="right">Mentees</TableCell>
                  <TableCell align="right">{period === "monthly" ? "Solved (30 days) per mentee" : "Solved per mentee"}</TableCell>
                  <TableCell align="right">Active (7 days)</TableCell>
                  <TableCell align="right">Needs attention</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {d.mentors.map((m) => {
                  const medal = m.rank ? MEDAL[m.rank] : undefined;
                  return (
                    <TableRow key={m.id} sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                      <TableCell sx={{ width: 72 }}>
                        {m.rank ? (
                          <Chip label={m.rank} size="small" sx={{ minWidth: 28, height: 22, fontWeight: 700, bgcolor: medal?.bg ?? "surfaceContainerHigh", color: medal?.fg ?? "text.secondary" }} />
                        ) : (
                          <Typography variant="caption" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                      <TableCell><Typography variant="body2" fontWeight={500}>{m.name}</Typography></TableCell>
                      <TableCell align="right">{m.mentees}</TableCell>
                      <TableCell align="right">{m.mentees ? m.solved_per_mentee : "—"}</TableCell>
                      <TableCell align="right">{m.mentees ? `${m.active_pct}%` : "—"}</TableCell>
                      <TableCell align="right">{m.mentees ? `${m.needs_attention_pct}%` : "—"}</TableCell>
                      <TableCell align="right">
                        <Button size="small" onClick={() => setAssign({ mentor: m.id })} disabled={!roster.data}>Assign students</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      <AssignDialog
        open={!!assign} onClose={() => setAssign(null)}
        mentors={d.mentors} students={roster.data?.students ?? []} initialMentor={assign?.mentor ?? ""}
      />
    </Box>
  );
}
