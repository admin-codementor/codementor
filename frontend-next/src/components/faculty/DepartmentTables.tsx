"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import Typography from "@mui/material/Typography";
import { ExportButton, FlagChip, toCsv, ThresholdsDialog } from "@/components/analytics";
import type { Flag } from "@/components/analytics";
import { EmptyState } from "@/components/ui/States";
import { SearchField } from "@/components/ui/SearchField";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { TrendingDownIcon, TrendingUpIcon, GroupsOutlinedIcon } from "@/components/ui/icons";
import { typeScale } from "@/theme/tokens";

export interface DeptStudent {
  id: string; name: string; roll_no: string | null; section: string | null; year: number | null;
  subs: number; solved: number; ac_rate: number; active_days: number;
  state: string; last_active: string | null;
  flag: string; reasons: string[]; percentile: number; badge: string;
  week: { solved: number; solved_change: number | null; subs: number; subs_change: number | null; active_days: number };
}

type Dir = "asc" | "desc";
const PAGE = 25;

/** Search + sort + paginate, shared by both tables so they behave identically. */
export function useTable<T, K extends string>(rows: T[], searchText: (r: T) => string, sorters: Record<K, (r: T) => number | string>, initial: { by: K; dir: Dir }) {
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState(initial);
  const [page, setPage] = React.useState(0);

  const sorted = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle ? rows.filter((r) => searchText(r).toLowerCase().includes(needle)) : rows;
    const get = sorters[sort.by];
    return [...filtered].sort((a, b) => {
      const x = get(a); const y = get(b);
      const c = typeof x === "string" || typeof y === "string" ? String(x).localeCompare(String(y)) : x - y;
      return sort.dir === "asc" ? c : -c;
    });
  }, [rows, q, sort, sorters, searchText]);

  const safePage = Math.min(page, Math.max(0, Math.ceil(sorted.length / PAGE) - 1));
  return {
    q, setQ: (v: string) => { setQ(v); setPage(0); },
    sort, toggle: (by: K) => { setSort((s) => (s.by === by ? { by, dir: s.dir === "asc" ? "desc" : "asc" } : { by, dir: "desc" })); setPage(0); },
    page: safePage, setPage, all: sorted, visible: sorted.slice(safePage * PAGE, safePage * PAGE + PAGE),
  };
}

export function Head<K extends string>({ id, label, sort, toggle, align }: {
  id: K; label: string; sort: { by: K; dir: Dir }; toggle: (k: K) => void; align?: "right";
}) {
  const active = sort.by === id;
  return (
    <TableCell align={align} sortDirection={active ? sort.dir : false}>
      <TableSortLabel active={active} direction={active ? sort.dir : "desc"} onClick={() => toggle(id)}>{label}</TableSortLabel>
    </TableCell>
  );
}

export const headRow = { "& th": { color: "text.secondary", fontWeight: 600, borderColor: "outlineVariant" } };
export const bodyRow = { cursor: "pointer", "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } };

export function Pager({ count, page, onPage }: { count: number; page: number; onPage: (p: number) => void }) {
  return (
    <TablePagination
      component="div" count={count} page={page} rowsPerPage={PAGE} rowsPerPageOptions={[PAGE]}
      onPageChange={(_, p) => onPage(p)} sx={{ borderTop: "1px solid", borderColor: "outlineVariant" }}
    />
  );
}

function Delta({ value }: { value: number | null }) {
  if (value == null) return <Typography variant="caption" color="text.disabled">—</Typography>;
  if (value === 0) return <Typography variant="caption" color="text.secondary">no change</Typography>;
  const up = value > 0;
  return (
    <Stack direction="row" spacing={0.25} alignItems="center" sx={{ color: up ? "success.main" : "error.main" }}>
      {up ? <TrendingUpIcon fontSize="small" /> : <TrendingDownIcon fontSize="small" />}
      <Typography variant="caption" fontWeight={600}>{up ? "+" : ""}{value}</Typography>
    </Stack>
  );
}

const WEEK_FILTERS = [
  { value: "all" as const, label: "Everyone" },
  { value: "up" as const, label: "Improving" },
  { value: "down" as const, label: "Dropped" },
  { value: "idle" as const, label: "No activity" },
];
type WeekFilter = (typeof WEEK_FILTERS)[number]["value"];

const WEEK_SORT = {
  name: (r: DeptStudent) => r.name,
  solved: (r: DeptStudent) => r.week.solved,
  solvedChange: (r: DeptStudent) => r.week.solved_change ?? 0,
  subs: (r: DeptStudent) => r.week.subs,
  days: (r: DeptStudent) => r.week.active_days,
};
type WeekSortKey = keyof typeof WEEK_SORT;
const searchText = (r: DeptStudent) => `${r.name} ${r.roll_no ?? ""} ${r.section ?? ""}`;

/** One row per student: this week against the week before. The loop a department head actually runs every Monday. */
export function WeeklyProgressTable({ students }: { students: DeptStudent[] }) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<WeekFilter>("all");
  const rows = React.useMemo(() => students.filter((s) => {
    if (filter === "up") return (s.week.solved_change ?? 0) > 0 || (s.week.subs_change ?? 0) > 0;
    if (filter === "down") return (s.week.solved_change ?? 0) < 0 || (s.week.subs_change ?? 0) < 0;
    if (filter === "idle") return s.week.subs === 0;
    return true;
  }), [students, filter]);
  const t = useTable<DeptStudent, WeekSortKey>(rows, searchText, WEEK_SORT, { by: "solvedChange", dir: "desc" });

  const csv = () => toCsv(t.all.map((s) => ({
    name: s.name, roll_no: s.roll_no ?? "", section: s.section ?? "",
    solved_this_week: s.week.solved, solved_change: s.week.solved_change ?? "",
    submissions_this_week: s.week.subs, submissions_change: s.week.subs_change ?? "",
    active_days_this_week: s.week.active_days,
  })));

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        The last 7 days against the 7 before. A problem counts in the week it was first solved, so re-solving old work does not inflate a week.
      </Typography>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} sx={{ mb: 2 }}>
        <SearchField value={t.q} onChange={t.setQ} placeholder="Name, roll no or section" label="Search students" sx={{ maxWidth: 320 }} />
        <SegmentedButtons<WeekFilter> value={filter} onChange={setFilter} segments={WEEK_FILTERS} ariaLabel="Filter by weekly change" />
        <Box sx={{ flex: 1 }} />
        <ExportButton filename="weekly-progress.csv" csv={csv} disabled={t.all.length === 0} />
      </Stack>
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
        {t.all.length === 0 ? (
          <EmptyState compact icon={<GroupsOutlinedIcon />} title="No students match" description="Try a different filter or clear the search." />
        ) : (
          <>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small" aria-label="Weekly progress by student" sx={{ minWidth: 720 }}>
                <TableHead>
                  <TableRow sx={headRow}>
                    <Head id="name" label="Student" sort={t.sort} toggle={t.toggle} />
                    <Head id="solved" label="Solved" sort={t.sort} toggle={t.toggle} align="right" />
                    <Head id="solvedChange" label="Solved change" sort={t.sort} toggle={t.toggle} align="right" />
                    <Head id="subs" label="Submissions" sort={t.sort} toggle={t.toggle} align="right" />
                    <TableCell align="right">Submissions change</TableCell>
                    <Head id="days" label="Active days" sort={t.sort} toggle={t.toggle} align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {t.visible.map((s) => (
                    <TableRow key={s.id} hover onClick={() => router.push(`/faculty/students/${s.id}`)} sx={bodyRow}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>{s.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{[s.roll_no, s.section && `Sec ${s.section}`].filter(Boolean).join(" · ")}</Typography>
                      </TableCell>
                      <TableCell align="right">{s.week.solved}</TableCell>
                      <TableCell align="right"><Stack alignItems="flex-end"><Delta value={s.week.solved_change} /></Stack></TableCell>
                      <TableCell align="right">{s.week.subs}</TableCell>
                      <TableCell align="right"><Stack alignItems="flex-end"><Delta value={s.week.subs_change} /></Stack></TableCell>
                      <TableCell align="right">{s.week.active_days} / 7</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Pager count={t.all.length} page={t.page} onPage={t.setPage} />
          </>
        )}
      </Card>
    </Box>
  );
}

export const MEDAL: Record<number, { bg: string; fg: string }> = {
  1: { bg: "tertiaryContainer", fg: "onTertiaryContainer" },
  2: { bg: "secondaryContainer", fg: "onSecondaryContainer" },
  3: { bg: "surfaceContainerHighest", fg: "onSurfaceVariant" },
};

const RANK_SORT = {
  rank: (r: Ranked) => r.rank,
  name: (r: Ranked) => r.name,
  solved: (r: Ranked) => r.solved,
  acc: (r: Ranked) => r.ac_rate,
  percentile: (r: Ranked) => r.percentile,
};
type RankSortKey = keyof typeof RANK_SORT;
type Ranked = DeptStudent & { rank: number };

/** Competition ranking: by problems solved, then accuracy; equal on both shares a rank. */
function rank(students: DeptStudent[]): Ranked[] {
  const ordered = [...students].sort((a, b) => b.solved - a.solved || b.ac_rate - a.ac_rate || a.name.localeCompare(b.name));
  let current = 0;
  return ordered.map((s, i) => {
    const prev = ordered[i - 1];
    if (!prev || prev.solved !== s.solved || prev.ac_rate !== s.ac_rate) current = i + 1;
    return { ...s, rank: current };
  });
}

/** Every student, ranked, with their badge and flag. */
export function RankingsTable({ students }: { students: DeptStudent[] }) {
  const router = useRouter();
  const ranked = React.useMemo(() => rank(students), [students]);
  const t = useTable<Ranked, RankSortKey>(ranked, searchText, RANK_SORT, { by: "rank", dir: "asc" });

  const csv = () => toCsv(t.all.map((s) => ({
    rank: s.rank, name: s.name, roll_no: s.roll_no ?? "", section: s.section ?? "", year: s.year ?? "",
    solved: s.solved, accuracy_pct: s.ac_rate, badge: s.badge, flag: s.flag,
  })));

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Ranked by problems solved, then accuracy. Students level on both share a rank.
        </Typography>
        <ThresholdsDialog kind="badge" />
      </Stack>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} sx={{ mb: 2 }}>
        <SearchField value={t.q} onChange={t.setQ} placeholder="Name, roll no or section" label="Search students" sx={{ maxWidth: 320 }} />
        <Box sx={{ flex: 1 }} />
        <ExportButton filename="student-rankings.csv" csv={csv} disabled={t.all.length === 0} />
      </Stack>
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
        {t.all.length === 0 ? (
          <EmptyState compact icon={<GroupsOutlinedIcon />} title="No students match" description="Try clearing the search." />
        ) : (
          <>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small" aria-label="Student rankings" sx={{ minWidth: 720 }}>
                <TableHead>
                  <TableRow sx={headRow}>
                    <Head<RankSortKey> id="rank" label="Rank" sort={t.sort} toggle={t.toggle} />
                    <Head<RankSortKey> id="name" label="Student" sort={t.sort} toggle={t.toggle} />
                    <Head<RankSortKey> id="solved" label="Solved" sort={t.sort} toggle={t.toggle} align="right" />
                    <Head<RankSortKey> id="acc" label="Accuracy" sort={t.sort} toggle={t.toggle} align="right" />
                    <Head<RankSortKey> id="percentile" label="Badge" sort={t.sort} toggle={t.toggle} />
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {t.visible.map((s) => {
                    const medal = MEDAL[s.rank];
                    return (
                      <TableRow key={s.id} hover onClick={() => router.push(`/faculty/students/${s.id}`)} sx={bodyRow}>
                        <TableCell sx={{ width: 72 }}>
                          <Chip
                            label={s.rank} size="small"
                            sx={{ minWidth: 28, height: 22, fontWeight: 700, bgcolor: medal?.bg ?? "surfaceContainerHigh", color: medal?.fg ?? "text.secondary" }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>{s.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {[s.roll_no, s.section && `Sec ${s.section}`, s.year && `Year ${s.year}`].filter(Boolean).join(" · ")}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{s.solved}</TableCell>
                        <TableCell align="right">{s.ac_rate}%</TableCell>
                        <TableCell>
                          <Chip size="small" label={s.badge} variant="outlined" sx={{ height: 22, fontSize: typeScale.labelSmall.fontSize, borderColor: "outlineVariant" }} />
                        </TableCell>
                        <TableCell><FlagChip flag={s.flag as Flag} reasons={s.reasons} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <Pager count={t.all.length} page={t.page} onPage={t.setPage} />
          </>
        )}
      </Card>
    </Box>
  );
}
