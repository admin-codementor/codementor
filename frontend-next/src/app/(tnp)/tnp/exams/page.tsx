"use client";

import * as React from "react";
import NextLink from "next/link";
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
import Button from "@mui/material/Button";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { headRow } from "@/components/faculty/DepartmentTables";
import { fmtDateTime } from "@/components/tnp/types";

interface ExamRow { id: string; title: string; window_start: string | null; window_end: string | null; duration_minutes: number }

/** Exams that are published, so the office can help a student who was cut off: open the live roster and resume them. */
export default function TnpExamsPage() {
  const query = useQuery<ExamRow[]>({ queryKey: ["tnp", "exams"], queryFn: async () => (await api.get("/api/exams")).data.data, staleTime: 30_000 });
  const [now] = React.useState(() => Date.now()); // when the page was opened; enough to tell open from ended
  const rows = [...(query.data ?? [])].sort((a, b) => String(b.window_start).localeCompare(String(a.window_start)));
  return (
    <>
      <PageHeader title="Exams" subtitle="If a student was cut off during an exam, open its live roster and resume them. A reason is required and is kept with the attempt." />
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
        <DataState loading={query.isLoading} error={query.isError ? query.error : undefined} onRetry={() => query.refetch()} skeleton={<TableSkeleton rows={5} columns={4} />}
          empty={rows.length === 0} emptyVariant="unassigned" emptyTitle="No published exams" emptyDescription="Exams appear here once faculty publish them.">
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small" aria-label="Published exams" sx={{ minWidth: 560 }}>
              <TableHead><TableRow sx={headRow}><TableCell>Exam</TableCell><TableCell>Window</TableCell><TableCell>State</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>
                {rows.map((e) => {
                  const start = e.window_start ? new Date(e.window_start).getTime() : 0;
                  const end = e.window_end ? new Date(e.window_end).getTime() : Infinity;
                  const live = now >= start && now <= end;
                  return (
                    <TableRow key={e.id} sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                      <TableCell><Typography variant="body2" fontWeight={500}>{e.title}</Typography><Typography variant="caption" color="text.secondary">{e.duration_minutes} minutes</Typography></TableCell>
                      <TableCell><Stack><Typography variant="body2">{fmtDateTime(e.window_start)}</Typography><Typography variant="caption" color="text.secondary">to {fmtDateTime(e.window_end)}</Typography></Stack></TableCell>
                      <TableCell>{live ? <Chip size="small" label="Open now" sx={{ height: 22, fontWeight: 600, bgcolor: "successContainer", color: "onSuccessContainer" }} /> : <Chip size="small" label={now < start ? "Not started" : "Ended"} sx={{ height: 22, fontWeight: 600, bgcolor: "surfaceContainerHigh", color: "onSurfaceVariant" }} />}</TableCell>
                      <TableCell align="right"><Button size="small" component={NextLink} href={`/tnp/exams/${e.id}`}>Live roster</Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </DataState>
      </Card>
    </>
  );
}
