"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { apiErrorMessage } from "@/lib/apiError";
import { ExportButton, KpiRow, KpiTile, toCsv } from "@/components/analytics";
import { EmptyState } from "@/components/ui/States";
import { SearchField } from "@/components/ui/SearchField";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { BAND_STYLE } from "@/components/career/CareerTabs";
import { GroupsOutlinedIcon } from "@/components/ui/icons";
import { typeScale } from "@/theme/tokens";
import { useStaffReadinessQuery, type ReadinessBand, type ReadinessRow } from "@/lib/queries/career";
import { Head, Pager, bodyRow, headRow, useTable } from "./DepartmentTables";

type Filter = "all" | ReadinessBand;
const SORT = { name: (r: ReadinessRow) => r.name, passed: (r: ReadinessRow) => r.passed };
type SortKey = keyof typeof SORT;
const searchText = (r: ReadinessRow) => `${r.name} ${r.rollNo ?? ""} ${r.section ?? ""}`;
const MISSING_LABEL = { resume: "resume", interview: "mock interview", practice: "practice" } as const;

/** Placement readiness bands for the HOD: who is ready, who is close, and what each student still lacks. */
export function PlacementReadiness({ section, year }: { section: string; year: string }) {
  const router = useRouter();
  const query = useStaffReadinessQuery(year, section);
  const [band, setBand] = React.useState<Filter>("all");
  const d = query.data;
  const rows = React.useMemo(() => (d?.rows ?? []).filter((r) => band === "all" || r.band === band), [d, band]);
  const t = useTable<ReadinessRow, SortKey>(rows, searchText, SORT, { by: "passed", dir: "desc" });

  if (query.isError) {
    return <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => query.refetch()}>Retry</Button>}>{apiErrorMessage(query.error, "Could not load placement readiness.")}</Alert>;
  }
  if (query.isLoading || !d) return <Skeleton variant="rounded" height={320} />;
  if (d.total === 0) {
    return <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}><EmptyState compact icon={<GroupsOutlinedIcon />} title="No students in this view" description="Try clearing the section or year filter." /></Card>;
  }

  const csv = () => toCsv(t.all.map((r) => ({
    name: r.name, roll_no: r.rollNo ?? "", class: r.classLabel, band: d.bands.find((b) => b.key === r.band)?.label ?? r.band,
    resume_score: r.checks.resume.value ?? "", best_interview: r.checks.interview.value ?? "", problems_solved: r.checks.practice.value ?? 0,
    still_needs: r.missing.map((m) => MISSING_LABEL[m]).join("; "),
  })));
  const label = (b: ReadinessBand) => d.bands.find((x) => x.key === b)?.label ?? b;

  return (
    <Stack spacing={3}>
      <Typography variant="body2" color="text.secondary">
        A student is <b>Ready</b> when they have a resume check of {d.rule.resume}+, a mock interview of {d.rule.interview}+ out of 10 and {d.rule.practice}+ problems solved on CodeMentor.
        Two of three is Almost ready, one is Building up. It counts only what students did here, not drives or marks.
      </Typography>
      <KpiRow min={170}>
        {d.bands.map((b) => <KpiTile key={b.key} icon={<GroupsOutlinedIcon />} label={b.label} value={d.counts[b.key]} total={d.total} accent={b.key === "ready" ? "success" : b.key === "almost" ? "primary" : b.key === "building" ? "warning" : undefined} />)}
      </KpiRow>

      <Box>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} sx={{ mb: 2 }}>
          <SearchField value={t.q} onChange={t.setQ} placeholder="Name, roll no or section" label="Search students" sx={{ maxWidth: 320 }} />
          <SegmentedButtons<Filter> value={band} onChange={setBand} ariaLabel="Readiness band" segments={[{ value: "all", label: "Everyone" }, ...d.bands.map((b) => ({ value: b.key as Filter, label: b.label }))]} />
          <Box sx={{ flex: 1 }} />
          <ExportButton filename="placement-readiness.csv" csv={csv} disabled={t.all.length === 0} />
        </Stack>
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
          {t.all.length === 0 ? (
            <EmptyState compact icon={<GroupsOutlinedIcon />} title="No students match" description="Try a different band or clear the search." />
          ) : (
            <>
              <TableContainer sx={{ overflowX: "auto" }}>
                <Table size="small" aria-label="Students and placement readiness" sx={{ minWidth: 720 }}>
                  <TableHead>
                    <TableRow sx={headRow}>
                      <Head<SortKey> id="name" label="Student" sort={t.sort} toggle={t.toggle} />
                      <TableCell align="right">Resume</TableCell>
                      <TableCell align="right">Interview</TableCell>
                      <TableCell align="right">Solved</TableCell>
                      <Head<SortKey> id="passed" label="Band" sort={t.sort} toggle={t.toggle} />
                      <TableCell>Still needs</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {t.visible.map((r) => (
                      <TableRow key={r.id} hover onClick={() => router.push(`/faculty/students/${r.id}`)} sx={bodyRow}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>{r.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{[r.rollNo, r.classLabel].filter(Boolean).join(" · ")}</Typography>
                        </TableCell>
                        <TableCell align="right">{r.checks.resume.value ?? "—"}</TableCell>
                        <TableCell align="right">{r.checks.interview.value ?? "—"}</TableCell>
                        <TableCell align="right">{r.checks.practice.value ?? 0}</TableCell>
                        <TableCell>
                          <Chip size="small" label={label(r.band)} sx={{ height: 22, fontSize: typeScale.labelSmall.fontSize, fontWeight: 600, bgcolor: BAND_STYLE[r.band].bg, color: BAND_STYLE[r.band].fg }} />
                        </TableCell>
                        <TableCell><Typography variant="caption" color="text.secondary">{r.missing.length ? r.missing.map((m) => MISSING_LABEL[m]).join(", ") : "Nothing"}</Typography></TableCell>
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
    </Stack>
  );
}
