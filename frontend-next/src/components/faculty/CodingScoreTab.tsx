"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { getRole } from "@/lib/auth";
import { useToast } from "@/components/feedback/ToastProvider";
import { ExportButton, KpiTile, toCsv } from "@/components/analytics";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { SearchField } from "@/components/ui/SearchField";
import { GroupsOutlinedIcon, FlagOutlinedIcon, RefreshOutlinedIcon } from "@/components/ui/icons";
import { Head, Pager, bodyRow, headRow, useTable } from "./DepartmentTables";
import { TypedNumbersDialog, useUnverifiedCount } from "./TypedNumbersDialog";

export type Flag = "red" | "orange" | "green";
export interface ScoreFormula { overall: string; platforms: { platform: string; label: string; text: string }[]; platformsTyped: { text: string; labels: string[] }; why: string }
export interface Thresholds { red: number; green: number }
interface Row {
  id: string; name: string; rollNo: string | null; section: string | null; year: number | null; classLabel: string;
  overall: number; flag: Flag; points: Record<string, number>; flags: Record<string, Flag>; linked: string[]; links: Record<string, string>; lastSyncedMs: number | null;
}
interface Data {
  totals: { students: number; red: number; orange: number; green: number; avg: number; withAnyLink: number };
  rows: Row[]; formula: ScoreFormula;
  thresholds: { default: Thresholds; byYear: Record<string, Thresholds>; builtIn: Thresholds };
  platforms: { key: string; label: string }[];
}

export const FLAG_STYLE: Record<Flag, { bg: string; fg: string; label: string }> = {
  red: { bg: "errorContainer", fg: "onErrorContainer", label: "Red" },
  orange: { bg: "warningContainer", fg: "onWarningContainer", label: "Orange" },
  green: { bg: "successContainer", fg: "onSuccessContainer", label: "Green" },
};

export function FlagChip({ flag, children }: { flag: Flag; children?: React.ReactNode }) {
  const s = FLAG_STYLE[flag];
  return <Chip size="small" label={children ?? s.label} sx={{ height: 22, fontWeight: 700, bgcolor: s.bg, color: s.fg }} />;
}

export function FormulaDialog({ open, onClose, formula }: { open: boolean; onClose: () => void; formula: ScoreFormula }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="formula-title">
      <DialogTitle id="formula-title">How the coding score works</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Typography variant="body2"><strong>Overall:</strong> {formula.overall}</Typography>
          {formula.platforms.map((p) => (
            <Box key={p.platform}>
              <Typography variant="subtitle2" fontWeight={700}>{p.label}</Typography>
              <Typography variant="body2" color="text.secondary">{p.text}</Typography>
            </Box>
          ))}
          <Alert severity="info">{formula.why}</Alert>
          <Typography variant="caption" color="text.secondary">{formula.platformsTyped.text}</Typography>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}

function ThresholdsDialog({ open, onClose, data, canEdit }: { open: boolean; onClose: () => void; data: Data; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [year, setYear] = React.useState("default");
  const current = year === "default" ? data.thresholds.default : (data.thresholds.byYear[year] ?? null);
  const [red, setRed] = React.useState(String(data.thresholds.default.red));
  const [green, setGreen] = React.useState(String(data.thresholds.default.green));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const t = current ?? data.thresholds.default;
    setRed(String(t.red)); setGreen(String(t.green)); setError(null);
  }, [year, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (clear = false) => {
    setBusy(true); setError(null);
    try {
      await api.put("/api/faculty/platform-thresholds", clear ? { year, clear: true } : { year, red: Number(red), green: Number(green) });
      toast(clear ? "Back to the default for this year." : "Thresholds saved.", { severity: "success" });
      qc.invalidateQueries({ queryKey: ["platform-scores"] });
    } catch (e) {
      setError(apiErrorMessage(e, "Could not save."));
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="thr-title">
      <DialogTitle id="thr-title">Flag thresholds</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">Points are 0 to 100. Below <strong>red</strong> is red, <strong>green</strong> and above is green, in between is orange. This applies to every platform and the overall score.</Typography>
          <TextField select size="small" label="College year" value={year} onChange={(e) => setYear(e.target.value)}>
            <MenuItem value="default">Default (every year)</MenuItem>
            {[1, 2, 3, 4].map((y) => <MenuItem key={y} value={String(y)}>Year {y}{data.thresholds.byYear[String(y)] ? " (own thresholds)" : ""}</MenuItem>)}
          </TextField>
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" type="number" label="Red below" value={red} onChange={(e) => setRed(e.target.value)} disabled={!canEdit} slotProps={{ htmlInput: { min: 0, max: 99 } }} />
            <TextField size="small" type="number" label="Green from" value={green} onChange={(e) => setGreen(e.target.value)} disabled={!canEdit} slotProps={{ htmlInput: { min: 1, max: 100 } }} />
          </Stack>
          {year !== "default" && !current && <Typography variant="caption" color="text.secondary">Year {year} uses the default until you set its own.</Typography>}
          {!canEdit && <Alert severity="info">Only the HOD or an admin can change these.</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        {canEdit && year !== "default" && current && <Button onClick={() => save(true)} disabled={busy}>Use default</Button>}
        <Button onClick={onClose}>Close</Button>
        {canEdit && <Button variant="contained" onClick={() => save(false)} disabled={busy}>Save</Button>}
      </DialogActions>
    </Dialog>
  );
}

const SORT = {
  name: (r: Row) => r.name, cls: (r: Row) => `${String(r.year ?? 99).padStart(2, "0")}${r.section ?? "~"}`,
  overall: (r: Row) => r.overall, codementor: (r: Row) => r.points.codementor ?? 0, leetcode: (r: Row) => r.points.leetcode ?? 0,
  codeforces: (r: Row) => r.points.codeforces ?? 0, github: (r: Row) => r.points.github ?? 0,
};
type SortKey = keyof typeof SORT;
const searchText = (r: Row) => `${r.name} ${r.rollNo ?? ""} ${r.classLabel}`;

/** HOD view of the coding score: one row per student, flags per platform, the formula and thresholds one click away. */
export function CodingScoreTab({ section, year }: { section: string; year: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const canEdit = getRole() === "hod" || getRole() === "admin";
  const [formulaOpen, setFormulaOpen] = React.useState(false);
  const [thrOpen, setThrOpen] = React.useState(false);
  const [typedOpen, setTypedOpen] = React.useState(false);
  const pending = useUnverifiedCount();
  const [flagFilter, setFlagFilter] = React.useState<Flag | "all">("all");
  const [refreshing, setRefreshing] = React.useState(false);

  const q = useQuery<Data>({
    queryKey: ["platform-scores", section, year],
    queryFn: async () => (await api.get<{ success: boolean; data: Data }>("/api/faculty/platform-scores", { params: { ...(section ? { section } : {}), ...(year ? { year } : {}) } })).data.data,
    staleTime: 60_000,
  });
  const d = q.data;
  const rows = React.useMemo(() => (d?.rows ?? []).filter((r) => flagFilter === "all" || r.flag === flagFilter), [d, flagFilter]);
  const t = useTable<Row, SortKey>(rows, searchText, SORT, { by: "overall", dir: "desc" });

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = (await api.post<{ success: boolean; data: { refreshed: number; failed: number; remaining: number } }>("/api/faculty/platform-scores/refresh")).data.data;
      toast(`Read ${r.refreshed} profile${r.refreshed === 1 ? "" : "s"}${r.failed ? `, ${r.failed} could not be read` : ""}. ${r.remaining ? `${r.remaining} more to go: click again.` : "Everyone is up to date."}`, { severity: r.failed ? "warning" : "success" });
      qc.invalidateQueries({ queryKey: ["platform-scores"] });
    } catch (e) {
      toast(apiErrorMessage(e, "Refresh failed."), { severity: "error" });
    } finally { setRefreshing(false); }
  };

  const csv = () => toCsv(t.all.map((r) => ({
    name: r.name, roll_no: r.rollNo ?? "", class: r.classLabel, overall_score: r.overall, flag: r.flag,
    ...Object.fromEntries((d?.platforms ?? []).map((pl) => [pl.key, r.points[pl.key] ?? 0])),
    linked_platforms: r.linked.join(" "),
  })));

  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (q.isLoading || !d) return <Skeleton variant="rounded" height={260} />;

  return (
    <Stack spacing={2.5}>
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(5, 1fr)" } }}>
        <KpiTile icon={<GroupsOutlinedIcon />} label="Students" value={d.totals.students} />
        <KpiTile icon={<FlagOutlinedIcon />} label="Average score" value={d.totals.avg} accent="tertiary" help="Out of 100" />
        <KpiTile icon={<FlagOutlinedIcon />} label="Green" value={d.totals.green} total={d.totals.students} accent="success" onClick={() => setFlagFilter(flagFilter === "green" ? "all" : "green")} />
        <KpiTile icon={<FlagOutlinedIcon />} label="Orange" value={d.totals.orange} total={d.totals.students} accent="warning" onClick={() => setFlagFilter(flagFilter === "orange" ? "all" : "orange")} />
        <KpiTile icon={<FlagOutlinedIcon />} label="Red" value={d.totals.red} total={d.totals.students} accent="error" onClick={() => setFlagFilter(flagFilter === "red" ? "all" : "red")} />
      </Box>
      <Typography variant="caption" color="text.secondary">
        {d.totals.withAnyLink} of {d.totals.students} students have linked at least one outside platform. The score is the average of a student's best four platforms, so nobody is marked down for a site they do not use.
      </Typography>

      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}>
        <Button size="small" variant="outlined" onClick={() => setFormulaOpen(true)}>Formula</Button>
        <Button size="small" variant="outlined" onClick={() => setThrOpen(true)}>Thresholds</Button>
        {canEdit && <Button size="small" variant="outlined" onClick={() => setTypedOpen(true)}>Numbers to check{pending.data && pending.data.length > 0 ? ` (${pending.data.length})` : ""}</Button>}
        {canEdit && <Button size="small" variant="outlined" startIcon={<RefreshOutlinedIcon />} onClick={refresh} disabled={refreshing}>{refreshing ? "Reading…" : "Refresh profiles"}</Button>}
        {flagFilter !== "all" && <Chip label={`Showing ${FLAG_STYLE[flagFilter].label.toLowerCase()} only`} onDelete={() => setFlagFilter("all")} />}
        <Box sx={{ flex: 1 }} />
        <SearchField value={t.q} onChange={t.setQ} placeholder="Name, roll no or class" label="Search students" sx={{ maxWidth: 260 }} />
        <ExportButton filename="coding-scores.csv" csv={csv} disabled={t.all.length === 0} />
      </Stack>

      <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
        {t.all.length === 0 ? (
          <EmptyState compact icon={<GroupsOutlinedIcon />} title="No students match" description="Clear the colour filter or the search." />
        ) : (
          <>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small" aria-label="Coding score per student" sx={{ minWidth: 1100 }}>
                <TableHead>
                  <TableRow sx={headRow}>
                    <Head<SortKey> id="name" label="Student" sort={t.sort} toggle={t.toggle} />
                    <Head<SortKey> id="cls" label="Class" sort={t.sort} toggle={t.toggle} />
                    <Head<SortKey> id="overall" label="Score" sort={t.sort} toggle={t.toggle} align="right" />
                    <TableCell>Flag</TableCell>
                    {d.platforms.map((pl) => (pl.key in SORT
                      ? <Head<SortKey> key={pl.key} id={pl.key as SortKey} label={pl.label} sort={t.sort} toggle={t.toggle} align="right" />
                      : <TableCell key={pl.key} align="right">{pl.label}</TableCell>))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {t.visible.map((r) => (
                    <TableRow key={r.id} hover sx={bodyRow} onClick={() => router.push(`/faculty/students/${r.id}`)}>
                      <TableCell><Typography variant="body2" fontWeight={500}>{r.name}</Typography>{r.rollNo && <Typography variant="caption" color="text.secondary">{r.rollNo}</Typography>}</TableCell>
                      <TableCell>{r.classLabel}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{r.overall}</TableCell>
                      <TableCell><FlagChip flag={r.flag} /></TableCell>
                      {d.platforms.map(({ key: p }) => (
                        <TableCell key={p} align="right">
                          {p !== "codementor" && !r.linked.includes(p) ? <Typography variant="caption" color="text.disabled">not linked</Typography> : (
                            <Chip size="small" label={r.points[p]} sx={{ height: 20, minWidth: 44, bgcolor: FLAG_STYLE[r.flags[p]].bg, color: FLAG_STYLE[r.flags[p]].fg, fontWeight: 600 }} />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Pager count={t.all.length} page={t.page} onPage={t.setPage} />
          </>
        )}
      </Card>

      <FormulaDialog open={formulaOpen} onClose={() => setFormulaOpen(false)} formula={d.formula} />
      {canEdit && <TypedNumbersDialog open={typedOpen} onClose={() => setTypedOpen(false)} />}
      <ThresholdsDialog open={thrOpen} onClose={() => setThrOpen(false)} data={d} canEdit={canEdit} />
    </Stack>
  );
}
