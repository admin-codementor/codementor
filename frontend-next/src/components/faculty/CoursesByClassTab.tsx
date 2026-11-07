"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { DataState } from "@/components/ui/DataState";
import { SectionCard } from "@/components/ui/SectionCard";
import { CardGridSkeleton } from "@/components/ui/Skeletons";
import { radius } from "@/theme/tokens";
import { headRow } from "./DepartmentTables";

interface ClassRow { label: string; students: number; avg_percent: number; completed: number; in_progress: number; not_started: number }
interface CourseRow {
  id: string; title: string; total_problems: number;
  overall: { students: number; completed: number; inProgress: number; notStarted: number; avgPercent: number };
  classes: ClassRow[];
}
interface Data { classes: { label: string; students: number }[]; courses: CourseRow[] }

/** Every course, with how far each class (year and section) has got. The same progress rule as the course pages, so a student shows the same number everywhere. */
export function CoursesByClassTab() {
  const q = useQuery<Data>({
    queryKey: ["faculty", "courses-by-class"],
    queryFn: async () => (await api.get("/api/faculty/courses-by-class")).data.data,
    staleTime: 60_000,
  });
  const courses = q.data?.courses ?? [];
  return (
    <Stack spacing={3}>
      <Typography variant="body2" color="text.secondary">
        Progress is the share of a course&apos;s problems solved, averaged over the class. Finished means every problem solved. Courses with no problems yet are not listed.
      </Typography>
      <DataState loading={q.isLoading} error={q.isError ? q.error : undefined} onRetry={() => q.refetch()} skeleton={<CardGridSkeleton />}
        empty={courses.length === 0} emptyVariant="firstUse" emptyTitle="No courses with problems yet" emptyDescription="Once a course has problems, its progress by class appears here.">
        {courses.map((c) => (
          <SectionCard key={c.id} title={c.title}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
              {c.total_problems} problems · {c.overall.students} students · average {c.overall.avgPercent}% · {c.overall.completed} finished
            </Typography>
            <Box sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: radius.md, overflow: "hidden" }}>
              <TableContainer>
                <Table size="small" aria-label={`${c.title} progress by class`} sx={{ minWidth: 520 }}>
                  <TableHead><TableRow sx={headRow}>
                    <TableCell>Class</TableCell><TableCell align="right">Students</TableCell><TableCell align="right">Average progress</TableCell>
                    <TableCell align="right">Finished</TableCell><TableCell align="right">In progress</TableCell><TableCell align="right">Not started</TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {c.classes.map((r) => (
                      <TableRow key={r.label} sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                        <TableCell>{r.label}</TableCell>
                        <TableCell align="right">{r.students}</TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
                            <Box sx={{ width: 64, height: 6, borderRadius: radius.full, bgcolor: "surfaceContainerHighest", overflow: "hidden" }} aria-hidden>
                              <Box sx={{ width: `${r.avg_percent}%`, height: "100%", bgcolor: "primary.main" }} />
                            </Box>
                            <span>{r.avg_percent}%</span>
                          </Stack>
                        </TableCell>
                        <TableCell align="right">{r.completed}</TableCell>
                        <TableCell align="right">{r.in_progress}</TableCell>
                        <TableCell align="right">{r.not_started}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </SectionCard>
        ))}
      </DataState>
    </Stack>
  );
}
