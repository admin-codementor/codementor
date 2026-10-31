"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { DataState } from "@/components/ui/DataState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { useToast } from "@/components/feedback/ToastProvider";
import { radius } from "@/theme/tokens";
import { headRow } from "./DepartmentTables";

interface Pending { user_id: string; name: string; roll_no: string | null; department: string | null; section: string | null; year: number | null; platform: string; label: string; unit: string; handle: string; value: number; typed_at_ms: number | null }

export const useUnverifiedCount = () => useQuery<Pending[]>({
  queryKey: ["platform-unverified"],
  queryFn: async () => (await api.get("/api/faculty/platform-unverified")).data.data,
  staleTime: 60_000,
});

/**
 * The numbers students typed for CodeChef, HackerRank, InterviewBit and GeeksforGeeks. The server cannot read those sites, so a HOD or Admin
 * looks at the student's profile there and marks the number verified (it then counts in full) or rejects it (the student types it again).
 */
export function TypedNumbersDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const showToast = useToast();
  const query = useUnverifiedCount();
  const rows = query.data ?? [];
  const decide = useMutation({
    mutationFn: async (v: { user_id: string; platform: string; action: "verify" | "reject" }) => (await api.post("/api/faculty/platform-verify", v)).data.data,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["platform-unverified"] }); void qc.invalidateQueries({ queryKey: ["platform-scores"] }); },
    onError: (e) => showToast(apiErrorMessage(e, "Could not save that."), { severity: "error" }),
  });
  const profileUrl = (platform: string, handle: string) => {
    const h = encodeURIComponent(handle);
    return ({ codechef: `https://www.codechef.com/users/${h}`, hackerrank: `https://www.hackerrank.com/profile/${h}`, gfg: `https://www.geeksforgeeks.org/user/${h}/`, interviewbit: `https://www.interviewbit.com/profile/${h}/` } as Record<string, string>)[platform];
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby="typed-title">
      <DialogTitle id="typed-title">Numbers to check</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            For these four sites the student types their own number, because we cannot read them. Open the profile, compare, then <b>verify</b> (it counts in full) or <b>reject</b> (the number is removed and the student types it again). Until then a number counts at half.
          </Typography>
          <DataState loading={query.isLoading} error={query.isError ? query.error : undefined} onRetry={() => query.refetch()} skeleton={<TableSkeleton rows={4} columns={5} />}
            empty={rows.length === 0} emptyVariant="firstUse" emptyTitle="Nothing to check" emptyDescription="Every number students typed has been verified.">
            <Box sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: radius.md, overflow: "hidden" }}>
              <TableContainer sx={{ maxHeight: 420 }}>
                <Table size="small" stickyHeader aria-label="Typed numbers to check" sx={{ minWidth: 640 }}>
                  <TableHead><TableRow sx={headRow}><TableCell>Student</TableCell><TableCell>Platform</TableCell><TableCell>Typed</TableCell><TableCell>Profile</TableCell><TableCell /></TableRow></TableHead>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={`${r.user_id}_${r.platform}`} sx={{ "& td": { borderColor: "outlineVariant" }, "&:last-child td": { border: 0 } }}>
                        <TableCell><Typography variant="body2" fontWeight={500}>{r.name}</Typography><Typography variant="caption" color="text.secondary">{[r.roll_no, r.section && `Sec ${r.section}`, r.year && `Year ${r.year}`].filter(Boolean).join(" · ")}</Typography></TableCell>
                        <TableCell>{r.label}</TableCell>
                        <TableCell><b>{r.value}</b> <Typography component="span" variant="caption" color="text.secondary">{r.unit}</Typography></TableCell>
                        <TableCell>{r.handle ? <Button size="small" component="a" href={profileUrl(r.platform, r.handle)} target="_blank" rel="noopener noreferrer">{r.handle}</Button> : "—"}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                          <Button size="small" variant="contained" disabled={decide.isPending} onClick={() => decide.mutate({ user_id: r.user_id, platform: r.platform, action: "verify" })}>Verify</Button>
                          <Button size="small" color="error" disabled={decide.isPending} onClick={() => decide.mutate({ user_id: r.user_id, platform: r.platform, action: "reject" })}>Reject</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </DataState>
          {decide.isError && <Alert severity="error">{apiErrorMessage(decide.error, "Could not save that.")}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}
