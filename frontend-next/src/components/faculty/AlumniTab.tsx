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
import { ExportButton, KpiRow, KpiTile, toCsv } from "@/components/analytics";
import { useConfirm } from "@/components/feedback/ConfirmProvider";
import { useToast } from "@/components/feedback/ToastProvider";
import { EmptyState } from "@/components/ui/States";
import { SearchField } from "@/components/ui/SearchField";
import { CheckCircleOutlineIcon, GroupsOutlinedIcon, InboxIcon, SchoolOutlinedIcon } from "@/components/ui/icons";
import { radius, typeScale } from "@/theme/tokens";
import { Head, Pager, bodyRow, headRow, useTable, type DeptStudent } from "./DepartmentTables";

interface Alum { id: string; name: string; roll_no: string | null; section: string | null; graduation_year: number | null; solved: number; placed_at: string[] }
interface Overview {
  totals: { alumni: number; placed: number; placement_rate: number; batches: number; first_year: number | null; last_year: number | null };
  batches: { year: number | "Unknown"; students: number; placed: number; placement_rate: number; avg_solved: number }[];
  alumni: Alum[];
}

const SORT = {
  name: (r: Alum) => r.name,
  year: (r: Alum) => r.graduation_year ?? 0,
  solved: (r: Alum) => r.solved,
};
type SortKey = keyof typeof SORT;
const searchText = (r: Alum) => `${r.name} ${r.roll_no ?? ""} ${r.section ?? ""} ${r.graduation_year ?? ""} ${r.placed_at.join(" ")}`;

/** Choose active students and mark them as graduated. */
function GraduateDialog({ open, onClose, students }: { open: boolean; onClose: () => void; students: DeptStudent[] }) {
  const qc = useQueryClient();
  const showToast = useToast();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = React.useState(String(thisYear));
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [q, setQ] = React.useState("");

  const shown = students.filter((s) => !q.trim() || `${s.name} ${s.roll_no ?? ""} ${s.section ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const save = useMutation({
    mutationFn: async () => (await api.put("/api/faculty/alumni/graduation", { student_ids: [...picked], graduated: true, graduation_year: Number(year) })).data.data as { updated: number },
    onSuccess: (r) => { showToast(`Moved ${r.updated} student(s) to alumni`, { severity: "success" }); qc.invalidateQueries({ queryKey: ["faculty"] }); onClose(); },
  });
  const toggle = (id: string) => setPicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="grad-title">
      <DialogTitle id="grad-title">Mark students as graduated</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info" variant="outlined">
            Graduated students move to Alumni and leave the funnel, rankings, mentor groups, portfolio and placement
            figures. Their accounts and history are kept, and you can restore them any time.
          </Alert>
          <TextField size="small" label="Graduation year" type="number" value={year} onChange={(e) => setYear(e.target.value)} slotProps={{ htmlInput: { min: 2000, max: thisYear + 1 } }} sx={{ maxWidth: 200 }} />
          <SearchField value={q} onChange={setQ} placeholder="Search students" label="Search students" />
          <Box sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: radius.md, maxHeight: 300, overflowY: "auto" }}>
            {shown.length === 0 ? (
              <EmptyState compact icon={<GroupsOutlinedIcon />} title="No students match" />
            ) : shown.map((s) => (
              <Stack
                key={s.id} direction="row" alignItems="center" spacing={1} onClick={() => toggle(s.id)}
                sx={{ px: 1, py: 0.5, cursor: "pointer", borderBottom: "1px solid", borderColor: "outlineVariant", "&:last-of-type": { borderBottom: 0 }, bgcolor: picked.has(s.id) ? "primaryContainer" : "transparent" }}
              >
                <Checkbox size="small" checked={picked.has(s.id)} tabIndex={-1} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap>{s.name}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>{[s.roll_no, s.section && `Sec ${s.section}`, s.year && `Year ${s.year}`].filter(Boolean).join(" · ")}</Typography>
                </Box>
              </Stack>
            ))}
          </Box>
          {save.isError && <Alert severity="error">{apiErrorMessage(save.error, "Could not save.")}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, pl: 1 }}>{picked.size} selected</Typography>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => save.mutate()} disabled={picked.size === 0 || save.isPending}>{save.isPending ? "Saving…" : "Mark as graduated"}</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Graduated students: batches, where they were placed, and a way to graduate or restore students. */
export function AlumniTab() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const showToast = useToast();
  const [graduate, setGraduate] = React.useState(false);

  const query = useQuery<Overview>({
    queryKey: ["faculty", "alumni"],
    queryFn: async () => (await api.get("/api/faculty/alumni")).data.data,
    staleTime: 30_000,
  });
  // The active roster (unfiltered), for choosing who to graduate.
  const roster = useQuery<{ students: DeptStudent[] }>({
    queryKey: ["faculty", "department", "", "", "", "view"],
    queryFn: async () => (await api.get("/api/faculty/department")).data.data,
    staleTime: 30_000,
  });

  const restore = useMutation({
    mutationFn: async (id: string) => api.put("/api/faculty/alumni/graduation", { student_ids: [id], graduated: false }),
    onSuccess: () => { showToast("Student restored to the active cohort", { severity: "success" }); qc.invalidateQueries({ queryKey: ["faculty"] }); },
    onError: (e) => showToast(apiErrorMessage(e, "Could not restore the student."), { severity: "error" }),
  });

  const d = query.data;
  const t = useTable<Alum, SortKey>(d?.alumni ?? [], searchText, SORT, { by: "year", dir: "desc" });

  if (query.isError) {
    return <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => query.refetch()}>Retry</Button>}>{apiErrorMessage(query.error, "Could not load alumni.")}</Alert>;
  }
  if (query.isLoading || !d) return <Skeleton variant="rounded" height={300} />;

  const csv = () => toCsv(t.all.map((a) => ({
    name: a.name, roll_no: a.roll_no ?? "", section: a.section ?? "", graduation_year: a.graduation_year ?? "",
    problems_solved: a.solved, placed_at: a.placed_at.join("; "),
  })));
  const span = d.totals.first_year == null ? "—" : d.totals.first_year === d.totals.last_year ? String(d.totals.first_year) : `${d.totals.first_year}–${d.totals.last_year}`;

  return (
    <Box>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          Students you mark as graduated leave the active dashboards and appear here with their batch and placement outcome.
        </Typography>
        <Button variant="contained" onClick={() => setGraduate(true)} disabled={!roster.data}>Mark students as graduated</Button>
        <ExportButton filename="alumni.csv" csv={csv} disabled={d.alumni.length === 0} />
      </Stack>

      <KpiRow min={170}>
        <KpiTile icon={<SchoolOutlinedIcon />} label="Alumni" value={d.totals.alumni} />
        <KpiTile icon={<CheckCircleOutlineIcon />} accent="success" label="Placed" value={d.totals.placed} total={d.totals.alumni} help={`${d.totals.placement_rate}% of alumni have an offer recorded`} />
        <KpiTile icon={<GroupsOutlinedIcon />} accent="tertiary" label="Batches" value={d.totals.batches} />
        <KpiTile icon={<InboxIcon />} accent="secondary" label="Graduation span" value={span} />
      </KpiRow>

      {d.alumni.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState
            icon={<SchoolOutlinedIcon />} title="No alumni yet"
            description="When a batch finishes, mark those students as graduated to keep their record without crowding the active dashboards."
            action={<Button variant="contained" onClick={() => setGraduate(true)} disabled={!roster.data}>Mark students as graduated</Button>}
          />
        </Card>
      ) : (
        <>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Batches</Typography>
          <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden", mb: 3 }}>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small" aria-label="Alumni batches" sx={{ minWidth: 520 }}>
                <TableHead>
                  <TableRow sx={headRow}>
                    <TableCell>Batch</TableCell><TableCell align="right">Students</TableCell><TableCell align="right">Placed</TableCell>
                    <TableCell align="right">Placement rate</TableCell><TableCell align="right">Avg problems solved</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {d.batches.map((b) => (
                    <TableRow key={String(b.year)} sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                      <TableCell>{b.year === "Unknown" ? "Year not set" : `Class of ${b.year}`}</TableCell>
                      <TableCell align="right">{b.students}</TableCell><TableCell align="right">{b.placed}</TableCell>
                      <TableCell align="right">{b.placement_rate}%</TableCell><TableCell align="right">{b.avg_solved}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>

          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Alumni</Typography>
          <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
            <SearchField value={t.q} onChange={t.setQ} placeholder="Name, roll no, batch or company" label="Search alumni" sx={{ maxWidth: 340 }} />
          </Stack>
          <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
            {t.all.length === 0 ? (
              <EmptyState compact icon={<GroupsOutlinedIcon />} title="No alumni match" description="Try clearing the search." />
            ) : (
              <>
                <TableContainer sx={{ overflowX: "auto" }}>
                  <Table size="small" aria-label="Alumni" sx={{ minWidth: 680 }}>
                    <TableHead>
                      <TableRow sx={headRow}>
                        <Head<SortKey> id="name" label="Alumnus" sort={t.sort} toggle={t.toggle} />
                        <Head<SortKey> id="year" label="Batch" sort={t.sort} toggle={t.toggle} />
                        <Head<SortKey> id="solved" label="Solved" sort={t.sort} toggle={t.toggle} align="right" />
                        <TableCell>Placed at</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {t.visible.map((a) => (
                        <TableRow key={a.id} sx={{ ...bodyRow, cursor: "default" }}>
                          <TableCell>
                            <Typography variant="body2" fontWeight={500}>{a.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{[a.roll_no, a.section && `Sec ${a.section}`].filter(Boolean).join(" · ")}</Typography>
                          </TableCell>
                          <TableCell>{a.graduation_year ?? "—"}</TableCell>
                          <TableCell align="right">{a.solved}</TableCell>
                          <TableCell>
                            {a.placed_at.length === 0 ? <Typography variant="caption" color="text.disabled">—</Typography> : (
                              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                {a.placed_at.map((c) => <Chip key={c} size="small" label={c} sx={{ height: 20, fontSize: typeScale.labelSmall.fontSize, bgcolor: "successContainer", color: "onSuccessContainer" }} />)}
                              </Stack>
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <Button
                              size="small" disabled={restore.isPending}
                              onClick={async () => { if (await confirm({ title: `Restore ${a.name}?`, description: "They return to the active cohort and appear in the dashboards again.", confirmLabel: "Restore" })) restore.mutate(a.id); }}
                            >
                              Restore
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Pager count={t.all.length} page={t.page} onPage={t.setPage} />
              </>
            )}
          </Card>
        </>
      )}

      {graduate && <GraduateDialog open onClose={() => setGraduate(false)} students={roster.data?.students ?? []} />}
    </Box>
  );
}
