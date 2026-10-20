"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { ExportButton, toCsv } from "@/components/analytics";
import { EmptyState } from "@/components/ui/States";
import { SearchField } from "@/components/ui/SearchField";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { GroupsOutlinedIcon } from "@/components/ui/icons";
import type { CourseStatus, CourseStudentRow } from "@/lib/queries/courseAnalytics";
import { radius, typeScale } from "@/theme/tokens";
import { Head, Pager, bodyRow, headRow, useTable } from "./DepartmentTables";

export type StatusFilter = "all" | "pending" | CourseStatus;

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "pending", label: "Not finished" },
  { value: "completed", label: "Completed" },
  { value: "in_progress", label: "In progress" },
  { value: "not_started", label: "Not started" },
];

const STATUS_LABEL: Record<CourseStatus, string> = { completed: "Completed", in_progress: "In progress", not_started: "Not started" };

const SORT = {
  name: (r: CourseStudentRow) => r.name,
  cls: (r: CourseStudentRow) => `${String(r.year ?? 99).padStart(2, "0")}${r.section ?? "~"}`,
  percent: (r: CourseStudentRow) => r.percent,
  solved: (r: CourseStudentRow) => r.solved,
  units: (r: CourseStudentRow) => r.unitsDone,
  last: (r: CourseStudentRow) => r.lastActiveMs ?? 0,
};
type SortKey = keyof typeof SORT;

const searchText = (r: CourseStudentRow) => `${r.name} ${r.rollNo ?? ""} ${r.classLabel}`;
const fmtDate = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "Never");

/** Which of the six completion buckets a student falls in; mirrors completionBucketIndex on the server. */
export function bucketOf(solved: number, total: number): number {
  if (!total || solved === 0) return 0;
  if (solved >= total) return 5;
  const pct = Math.min(99, Math.max(1, Math.floor((solved / total) * 100)));
  return pct <= 25 ? 1 : pct <= 50 ? 2 : pct <= 75 ? 3 : 4;
}

/**
 * Every student's standing in one course: how far along, whether they have finished, and when they were last
 * active. Filter by state, class or a completion bucket; sort; export. A row opens that student's profile.
 */
export function CourseStudentsTable({
  rows, status, onStatus, bucket, onBucket, bucketLabel, courseTitle,
}: {
  rows: CourseStudentRow[];
  status: StatusFilter;
  onStatus: (s: StatusFilter) => void;
  /** A completion bucket picked by clicking the distribution chart, or null. */
  bucket: number | null;
  onBucket: (b: number | null) => void;
  bucketLabel: string | null;
  courseTitle: string;
}) {
  const router = useRouter();
  const [cls, setCls] = React.useState("");

  const classes = React.useMemo(() => [...new Set(rows.map((r) => r.classLabel))].sort(), [rows]);
  const filtered = React.useMemo(
    () => rows.filter((r) =>
      (status === "all" || (status === "pending" ? r.status !== "completed" : r.status === status))
      && (!cls || r.classLabel === cls)
      && (bucket == null || bucketOf(r.solved, r.total) === bucket)),
    [rows, status, cls, bucket],
  );
  const t = useTable<CourseStudentRow, SortKey>(filtered, searchText, SORT, { by: "percent", dir: "asc" });

  const csv = () => toCsv(t.all.map((r) => ({
    name: r.name, roll_no: r.rollNo ?? "", class: r.classLabel, solved: r.solved, total_problems: r.total,
    percent: r.percent, status: STATUS_LABEL[r.status], units_done: `${r.unitsDone}/${r.unitsTotal}`,
    last_active: r.lastActiveMs ? new Date(r.lastActiveMs).toISOString().slice(0, 10) : "",
  })));

  return (
    <Box>
      <Stack direction={{ xs: "column", lg: "row" }} spacing={2} alignItems={{ lg: "center" }} sx={{ mb: 2 }}>
        <SegmentedButtons<StatusFilter> value={status} onChange={onStatus} ariaLabel="Filter students by progress" segments={FILTERS} />
        {classes.length > 1 && (
          <TextField select size="small" label="Class" value={cls} onChange={(e) => setCls(e.target.value)} sx={{ minWidth: 170 }}>
            <MenuItem value="">All classes</MenuItem>
            {classes.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
        )}
        <SearchField value={t.q} onChange={t.setQ} placeholder="Name, roll no or class" label="Search students" sx={{ maxWidth: 300 }} />
        <Box sx={{ flex: 1 }} />
        <ExportButton filename={`${courseTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-progress.csv`} csv={csv} disabled={t.all.length === 0} />
      </Stack>
      {bucket != null && bucketLabel && (
        <Chip label={`Showing students at ${bucketLabel} of the course`} onDelete={() => onBucket(null)} sx={{ mb: 2 }} />
      )}

      <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
        {t.all.length === 0 ? (
          <EmptyState compact icon={<GroupsOutlinedIcon />} title="No students match" description="Try a different filter or clear the search." />
        ) : (
          <>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small" aria-label="Students and their progress in this course" sx={{ minWidth: 760 }}>
                <TableHead>
                  <TableRow sx={headRow}>
                    <Head<SortKey> id="name" label="Student" sort={t.sort} toggle={t.toggle} />
                    <Head<SortKey> id="cls" label="Class" sort={t.sort} toggle={t.toggle} />
                    <Head<SortKey> id="percent" label="Progress" sort={t.sort} toggle={t.toggle} />
                    <Head<SortKey> id="solved" label="Solved" sort={t.sort} toggle={t.toggle} align="right" />
                    <Head<SortKey> id="units" label="Units done" sort={t.sort} toggle={t.toggle} align="right" />
                    <TableCell>Status</TableCell>
                    <Head<SortKey> id="last" label="Last active" sort={t.sort} toggle={t.toggle} align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {t.visible.map((r) => (
                    <TableRow key={r.id} hover sx={bodyRow} onClick={() => router.push(`/faculty/students/${r.id}`)}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>{r.name}</Typography>
                        {r.rollNo && <Typography variant="caption" color="text.secondary">{r.rollNo}</Typography>}
                      </TableCell>
                      <TableCell>{r.classLabel}</TableCell>
                      <TableCell sx={{ minWidth: 170 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <LinearProgress variant="determinate" value={r.percent} aria-label={`${r.name}: ${r.percent}% of the course solved`} sx={{ flex: 1, height: 6, borderRadius: radius.xs }} />
                          <Typography variant="caption" sx={{ minWidth: 34, textAlign: "right" }}>{r.percent}%</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell align="right">{r.solved} / {r.total}</TableCell>
                      <TableCell align="right">{r.unitsDone} / {r.unitsTotal}</TableCell>
                      <TableCell>
                        <Chip
                          size="small" label={STATUS_LABEL[r.status]}
                          sx={{
                            height: 20, fontSize: typeScale.labelSmall.fontSize, fontWeight: 600,
                            bgcolor: r.status === "completed" ? "successContainer" : r.status === "in_progress" ? "primaryContainer" : "surfaceContainerHighest",
                            color: r.status === "completed" ? "onSuccessContainer" : r.status === "in_progress" ? "onPrimaryContainer" : "text.secondary",
                          }}
                        />
                      </TableCell>
                      <TableCell align="right">{fmtDate(r.lastActiveMs)}</TableCell>
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
