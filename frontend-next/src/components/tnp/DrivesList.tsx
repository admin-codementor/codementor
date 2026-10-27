"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { DataState } from "@/components/ui/DataState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { AddIcon } from "@/components/ui/icons";
import { typeScale } from "@/theme/tokens";
import { bodyRow, headRow } from "@/components/faculty/DepartmentTables";
import { fmtDateTime, type Drive, type DriveRow } from "./types";

export const usePlacementDrives = () => useQuery<DriveRow[]>({
  queryKey: ["placement", "drives"],
  queryFn: async () => (await api.get("/api/placement/drives")).data.data,
  staleTime: 30_000,
});

const chip = (bg: string, fg: string) => ({ height: 22, fontSize: typeScale.labelSmall.fontSize, fontWeight: 600, bgcolor: bg, color: fg });

/** The drive's state in one word: Draft, Open, Closed, or "Last date passed" when it is open but the last date to apply has gone by. */
export function DriveStateChip({ d, now }: { d: Drive; now?: number }) {
  if (d.publish_state === "draft") return <Chip size="small" label="Draft" sx={chip("surfaceContainerHigh", "onSurfaceVariant")} />;
  if (d.status === "closed") return <Chip size="small" label="Closed" sx={chip("surfaceContainerHigh", "onSurfaceVariant")} />;
  if (now != null && d.apply_by && new Date(d.apply_by).getTime() < now) return <Chip size="small" label="Last date passed" sx={chip("warningContainer", "onWarningContainer")} />;
  return <Chip size="small" label="Open" sx={chip("successContainer", "onSuccessContainer")} />;
}
export function TierChip({ tier }: { tier: Drive["tier"] }) {
  return tier === "dream" ? <Chip size="small" label="Dream" sx={chip("tertiaryContainer", "onTertiaryContainer")} /> : null;
}

/** The rules of a drive in one line, as students will read them. */
export function ruleSummary(d: Drive): string {
  const parts: string[] = [];
  if (d.eligible_years.length) parts.push(`Year ${d.eligible_years.join(", ")}`);
  if (d.min_cgpa != null) parts.push(`CGPA ${d.min_cgpa}+`);
  if (d.max_backlogs != null) parts.push(d.max_backlogs === 0 ? "No backlogs" : `Up to ${d.max_backlogs} backlog${d.max_backlogs === 1 ? "" : "s"}`);
  return parts.join(" · ") || "No extra rules";
}

/** Every drive the viewer may see. T&P and the Admin can start a new one and edit; an HOD only reads their department's. */
export function DrivesList({ canManage, onOpen, onNew, onEdit }: { canManage: boolean; onOpen: (id: string) => void; onNew?: () => void; onEdit?: (d: Drive) => void }) {
  const query = usePlacementDrives();
  const [now] = React.useState(() => Date.now()); // when the page was opened
  const drives = query.data ?? [];

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {canManage
            ? "A drive is one company visit. Make it a draft first, then publish it when students should see it."
            : "The drives for your department's students. Open one to see who applied and how each student did."}
        </Typography>
        {canManage && <Button variant="contained" startIcon={<AddIcon />} onClick={onNew}>New drive</Button>}
      </Stack>
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
        <DataState
          loading={query.isLoading} fetching={query.isFetching} error={query.isError ? query.error : undefined} onRetry={() => query.refetch()}
          skeleton={<TableSkeleton rows={5} />} empty={drives.length === 0} emptyVariant={canManage ? "firstUse" : "unassigned"}
          emptyTitle="No placement drives yet"
          emptyDescription={canManage ? "Create a drive for each company that visits. Students see it only after you publish it." : "Drives appear here when the Training & Placement office publishes one for your department."}
          emptyAction={canManage ? <Button variant="contained" startIcon={<AddIcon />} onClick={onNew}>Create the first drive</Button> : undefined}
        >
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small" aria-label="Placement drives" sx={{ minWidth: 860 }}>
              <TableHead>
                <TableRow sx={headRow}>
                  <TableCell>Company</TableCell><TableCell>State</TableCell><TableCell>Last date to apply</TableCell>
                  <TableCell align="right">Eligible</TableCell><TableCell align="right">Applied</TableCell>
                  <TableCell align="right">Shortlisted</TableCell><TableCell align="right">Selected</TableCell>{canManage && <TableCell />}
                </TableRow>
              </TableHead>
              <TableBody>
                {drives.map((d) => (
                  <TableRow key={d.id} hover onClick={() => onOpen(d.id)} sx={bodyRow}>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" fontWeight={500}>{d.company}</Typography>
                        <TierChip tier={d.tier} />
                      </Stack>
                      <Typography variant="caption" color="text.secondary" component="div">{[d.role, d.ctc, d.departments.join(", ")].filter(Boolean).join(" · ")}</Typography>
                      <Typography variant="caption" color="text.secondary" component="div">{ruleSummary(d)}</Typography>
                    </TableCell>
                    <TableCell><DriveStateChip d={d} now={now} /></TableCell>
                    <TableCell>{d.apply_by ? fmtDateTime(d.apply_by) : "No last date"}</TableCell>
                    <TableCell align="right">{d.eligible}</TableCell><TableCell align="right">{d.applied}</TableCell>
                    <TableCell align="right">{d.shortlisted}</TableCell><TableCell align="right">{d.selected}</TableCell>
                    {canManage && <TableCell align="right"><Button size="small" onClick={(e) => { e.stopPropagation(); onEdit?.(d); }}>Edit</Button></TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DataState>
      </Card>
    </Box>
  );
}
