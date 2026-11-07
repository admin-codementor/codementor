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
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { ExportButton, STATE_LABEL, toCsv } from "@/components/analytics";
import type { StudentState } from "@/components/analytics";
import { EmptyState } from "@/components/ui/States";
import { SearchField } from "@/components/ui/SearchField";
import { GroupsOutlinedIcon } from "@/components/ui/icons";
import { Head, Pager, bodyRow, headRow, useTable, type DeptStudent } from "./DepartmentTables";

const SORT = {
  name: (r: DeptStudent) => r.name,
  roll: (r: DeptStudent) => r.roll_no ?? "",
  batch: (r: DeptStudent) => r.batch ?? "",
  solved: (r: DeptStudent) => r.solved,
  last: (r: DeptStudent) => r.last_active ?? "",
};
type SortKey = keyof typeof SORT;
const text = (r: DeptStudent) => `${r.name} ${r.roll_no ?? ""} ${r.section ?? ""} ${r.batch ?? ""} ${r.mentor_name ?? ""}`;
const classOf = (r: DeptStudent) => [r.year && `Year ${r.year}`, r.section && `Sec ${r.section}`].filter(Boolean).join(" · ") || "No section";

/** Everyone in the view, one row each: name, roll number, batch, class, mentor and where they stand. The filters above the tabs narrow it. */
export function PeopleTab({ students }: { students: DeptStudent[] }) {
  const router = useRouter();
  const t = useTable<DeptStudent, SortKey>(students, text, SORT, { by: "name", dir: "asc" });
  const csv = () => toCsv(t.all.map((s) => ({
    name: s.name, roll_no: s.roll_no ?? "", batch: s.batch ?? "", class: classOf(s), mentor: s.mentor_name ?? "",
    practice_state: STATE_LABEL[s.state as StudentState] ?? s.state, problems_solved: s.solved, last_practised: s.last_active ? String(s.last_active).slice(0, 10) : "",
  })));
  return (
    <Box>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} sx={{ mb: 2 }}>
        <SearchField value={t.q} onChange={t.setQ} placeholder="Name, roll no, batch or mentor" label="Search students" sx={{ maxWidth: 360 }} />
        <Box sx={{ flex: 1 }} />
        <ExportButton filename="people.csv" csv={csv} disabled={t.all.length === 0} />
      </Stack>
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
        {t.all.length === 0 ? (
          <EmptyState compact icon={<GroupsOutlinedIcon />} title="No students match" description="Clear the search or a filter." />
        ) : (
          <>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table size="small" aria-label="Students" sx={{ minWidth: 820 }}>
                <TableHead>
                  <TableRow sx={headRow}>
                    <Head id="name" label="Student" sort={t.sort} toggle={t.toggle} />
                    <Head id="roll" label="Roll number" sort={t.sort} toggle={t.toggle} />
                    <Head id="batch" label="Batch" sort={t.sort} toggle={t.toggle} />
                    <TableCell>Class</TableCell>
                    <TableCell>Mentor</TableCell>
                    <TableCell>Practice</TableCell>
                    <Head id="solved" label="Solved" sort={t.sort} toggle={t.toggle} align="right" />
                    <Head id="last" label="Last practised" sort={t.sort} toggle={t.toggle} align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {t.visible.map((s) => (
                    <TableRow key={s.id} hover onClick={() => router.push(`/faculty/students/${s.id}`)} sx={bodyRow}>
                      <TableCell><Typography variant="body2" fontWeight={500}>{s.name}</Typography></TableCell>
                      <TableCell>{s.roll_no ?? "—"}</TableCell>
                      <TableCell>{s.batch ?? "—"}</TableCell>
                      <TableCell>{classOf(s)}</TableCell>
                      <TableCell>{s.mentor_name ?? <Typography variant="caption" color="text.secondary">No mentor</Typography>}</TableCell>
                      <TableCell><Chip size="small" label={STATE_LABEL[s.state as StudentState] ?? s.state} variant="outlined" /></TableCell>
                      <TableCell align="right">{s.solved}</TableCell>
                      <TableCell align="right" suppressHydrationWarning>{s.last_active ? String(s.last_active).slice(0, 10) : "Never"}</TableCell>
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
