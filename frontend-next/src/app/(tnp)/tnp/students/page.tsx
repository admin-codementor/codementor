"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
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
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { SearchField } from "@/components/ui/SearchField";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { Head, Pager, headRow, useTable } from "@/components/faculty/DepartmentTables";
import { RecordsUpload } from "@/components/tnp/RecordsUpload";
import { usePlacementMeta } from "@/components/tnp/types";

interface Row { id: string; name: string; roll_no: string | null; department: string | null; year: number | null; section: string | null; cgpa: number | null; backlogs: number | null; has_offer: boolean }
type View = "records" | "upload";
const VIEWS = [{ value: "records" as const, label: "Students" }, { value: "upload" as const, label: "Upload CGPA" }];
const SORT = { name: (r: Row) => r.name, cgpa: (r: Row) => r.cgpa ?? -1, backlogs: (r: Row) => r.backlogs ?? -1 };
type SortKey = keyof typeof SORT;

export default function TnpStudentsPage() {
  const [view, setView] = React.useState<View>("records");
  const [department, setDepartment] = React.useState("");
  const [year, setYear] = React.useState("");
  const meta = usePlacementMeta();
  const query = useQuery<Row[]>({
    queryKey: ["placement", "records", department, year],
    queryFn: async () => (await api.get("/api/placement/records", { params: { ...(department ? { department } : {}), ...(year ? { year } : {}) } })).data.data,
    staleTime: 30_000,
    enabled: view === "records",
  });
  const t = useTable<Row, SortKey>(query.data ?? [], (r) => `${r.name} ${r.roll_no ?? ""} ${r.section ?? ""}`, SORT, { by: "name", dir: "asc" });
  const missing = (query.data ?? []).filter((r) => r.cgpa == null).length;

  return (
    <>
      <PageHeader title="Students and CGPA" subtitle="Each student's CGPA and backlogs decide which drives they can apply to. Only the student, this office, the Admin and the student's own HOD can see them." />
      <SegmentedButtons<View> value={view} onChange={setView} segments={VIEWS} ariaLabel="Students view" />
      <Box sx={{ mt: 3 }}>
        {view === "upload" ? <RecordsUpload /> : (
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
              <SearchField value={t.q} onChange={t.setQ} placeholder="Name, roll no or section" label="Search students" sx={{ maxWidth: 320 }} />
              <TextField select size="small" label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} sx={{ minWidth: 200 }}>
                <MenuItem value="">All departments</MenuItem>
                {(meta.data?.departments ?? []).map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
              </TextField>
              <TextField select size="small" label="Year" value={year} onChange={(e) => setYear(e.target.value)} sx={{ minWidth: 120 }}>
                <MenuItem value="">All years</MenuItem>
                {(meta.data?.years ?? []).map((y) => <MenuItem key={y} value={String(y)}>Year {y}</MenuItem>)}
              </TextField>
              {query.data && <Typography variant="body2" color="text.secondary">{query.data.length} students{missing ? ` · ${missing} without a CGPA` : ""}</Typography>}
            </Stack>
            <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
              <DataState loading={query.isLoading} fetching={query.isFetching} error={query.isError ? query.error : undefined} onRetry={() => query.refetch()} skeleton={<TableSkeleton rows={8} columns={5} />}
                empty={t.all.length === 0} emptyVariant="filtered" emptyTitle="No students match" emptyDescription="Try a different department, year or search.">
                <TableContainer sx={{ overflowX: "auto" }}>
                  <Table size="small" aria-label="Students and their CGPA" sx={{ minWidth: 640 }}>
                    <TableHead>
                      <TableRow sx={headRow}>
                        <Head<SortKey> id="name" label="Student" sort={t.sort} toggle={t.toggle} />
                        <Head<SortKey> id="cgpa" label="CGPA" sort={t.sort} toggle={t.toggle} align="right" />
                        <Head<SortKey> id="backlogs" label="Backlogs" sort={t.sort} toggle={t.toggle} align="right" />
                        <TableCell>Offer</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {t.visible.map((r) => (
                        <TableRow key={r.id} sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                          <TableCell>
                            <Typography variant="body2" fontWeight={500}>{r.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{[r.roll_no, r.department, r.section && `Sec ${r.section}`, r.year && `Year ${r.year}`].filter(Boolean).join(" · ")}</Typography>
                          </TableCell>
                          <TableCell align="right">{r.cgpa ?? "—"}</TableCell>
                          <TableCell align="right">{r.backlogs ?? "—"}</TableCell>
                          <TableCell>{r.has_offer ? <Chip size="small" label="Has an offer" sx={{ height: 22, bgcolor: "successContainer", color: "onSuccessContainer", fontWeight: 600 }} /> : ""}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Pager count={t.all.length} page={t.page} onPage={t.setPage} />
              </DataState>
            </Card>
          </Stack>
        )}
      </Box>
    </>
  );
}
