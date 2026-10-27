"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { DeleteOutlineIcon, AddIcon } from "@/components/ui/icons";
import { useToast } from "@/components/feedback/ToastProvider";
import { TableSkeleton } from "@/components/ui/Skeletons";
import {
  parsePlacements, rangeProblems, staffLabel, suggestRanges,
  type ClassRow, type GenerateResult, type PlacementResult, type Roster, type Staff, type SubMentor,
} from "./types";

// ── pick a staff member ──
export function StaffSelect({ label, value, onChange, staff, allowNone, fullWidth = true }: { label: string; value: string; onChange: (v: string) => void; staff: Staff[]; allowNone?: boolean; fullWidth?: boolean }) {
  return (
    <TextField select size="small" label={label} value={value} onChange={(e) => onChange(e.target.value)} fullWidth={fullWidth} sx={{ minWidth: 180 }}>
      {allowNone && <MenuItem value="">None</MenuItem>}
      {staff.map((s) => <MenuItem key={s.id} value={s.id}>{staffLabel(s)}</MenuItem>)}
    </TextField>
  );
}

// ── new term (Admin) ──
export function TermDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [f, setF] = React.useState({ label: "", academicYear: "", semester: "", startDate: "", endDate: "" });
  const [error, setError] = React.useState("");
  const m = useMutation({
    mutationFn: async () => (await api.post("/api/academic/terms", f)).data.data as { id: string },
    onSuccess: (t) => { toast("Term created. Make it active when the semester begins.", { severity: "success" }); onCreated(t.id); onClose(); },
    onError: (e) => setError(apiErrorMessage(e, "Couldn't create the term.")),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <Dialog open={open} onClose={m.isPending ? undefined : onClose} maxWidth="xs" fullWidth aria-labelledby="term-title">
      <DialogTitle id="term-title">New term</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField size="small" label="Name" placeholder="2026-27 odd semester" value={f.label} onChange={set("label")} autoFocus />
          <TextField size="small" label="Academic year" placeholder="2026-27" value={f.academicYear} onChange={set("academicYear")} />
          <TextField size="small" label="Semester (optional)" placeholder="odd" value={f.semester} onChange={set("semester")} />
          <Stack direction="row" spacing={2}>
            <TextField size="small" type="date" label="Starts" value={f.startDate} onChange={set("startDate")} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
            <TextField size="small" type="date" label="Ends" value={f.endDate} onChange={set("endDate")} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={m.isPending}>Cancel</Button>
        <Button variant="contained" onClick={() => { setError(""); m.mutate(); }} disabled={m.isPending || !f.label || !f.academicYear || !f.startDate || !f.endDate}>{m.isPending ? "Creating…" : "Create term"}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── build classes + exceptions upload ──
export function GenerateResultDialog({ result, onClose }: { result: GenerateResult | null; onClose: () => void }) {
  return (
    <Dialog open={!!result} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="gen-title">
      <DialogTitle id="gen-title">Classes built</DialogTitle>
      <DialogContent dividers>
        {result && (
          <Stack spacing={1.5}>
            <Typography variant="body2">{result.classes} section class{result.classes === 1 ? "" : "es"} ({result.classesCreated} new). {result.enrolled} student{result.enrolled === 1 ? "" : "s"} placed now; {result.alreadyPlaced} were already placed and were not moved.</Typography>
            {result.skipped.length > 0 && (
              <Alert severity="warning">
                {result.skipped.length} student{result.skipped.length === 1 ? " has" : "s have"} no year or section on their record, so they were not placed. Fix their profile, or place them with an uploaded list:
                <Stack component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                  {result.skipped.slice(0, 12).map((s) => <Typography key={s.id} component="li" variant="caption">{s.name ?? s.id}{s.rollNo ? ` (${s.rollNo})` : ""}</Typography>)}
                  {result.skipped.length > 12 && <Typography component="li" variant="caption">and {result.skipped.length - 12} more</Typography>}
                </Stack>
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}><Button variant="contained" onClick={onClose}>OK</Button></DialogActions>
    </Dialog>
  );
}

export function PlacementsDialog({ open, onClose, termId, department }: { open: boolean; onClose: () => void; termId: string; department: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = React.useState("");
  const [result, setResult] = React.useState<PlacementResult | null>(null);
  const [error, setError] = React.useState("");
  const rows = React.useMemo(() => parsePlacements(text), [text]);
  const m = useMutation({
    mutationFn: async () => (await api.post(`/api/academic/terms/${termId}/placements`, { department, rows })).data.data as PlacementResult,
    onSuccess: (r) => { setResult(r); setError(""); void qc.invalidateQueries({ queryKey: ["academic"] }); if (r.failed === 0) toast(`${r.applied} student${r.applied === 1 ? "" : "s"} placed.`, { severity: "success" }); },
    onError: (e) => setError(apiErrorMessage(e, "Couldn't apply the list.")),
  });
  const close = () => { if (!m.isPending) { setText(""); setResult(null); setError(""); onClose(); } };
  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth aria-labelledby="place-title">
      <DialogTitle id="place-title">Place students from a list</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">For students who should be in a different class than their profile says (transfers, detained, mid-term moves). One line per student: roll number, year, section.</Typography>
          <Button component="label" variant="outlined" size="small" sx={{ alignSelf: "flex-start" }}>
            Choose a CSV file
            <input hidden type="file" accept=".csv,.txt,text/csv,text/plain" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = ""; }} />
          </Button>
          <TextField multiline minRows={6} maxRows={12} size="small" label="Or paste here" placeholder={"rollNo,year,section\n21CS045,3,B"} value={text} onChange={(e) => setText(e.target.value)} fullWidth />
          <Typography variant="caption" color="text.secondary">{rows.length} row{rows.length === 1 ? "" : "s"} read. Rows are checked one by one: the good ones are applied, the rest come back with the reason.</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {result && (
            <Alert severity={result.failed ? "warning" : "success"}>
              {result.applied} placed{result.failed ? `, ${result.failed} not placed:` : "."}
              {result.results.length > 0 && (
                <Stack component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                  {result.results.slice(0, 15).map((r) => <Typography key={r.row} component="li" variant="caption">Row {r.row}{r.rollNo ? ` (${r.rollNo})` : ""}: {r.reason}</Typography>)}
                </Stack>
              )}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={close} disabled={m.isPending}>{result ? "Close" : "Cancel"}</Button>
        <Button variant="contained" onClick={() => m.mutate()} disabled={m.isPending || rows.length === 0}>{m.isPending ? "Applying…" : "Apply list"}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── elective ──
export function ElectiveDialog({ open, onClose, termId, department }: { open: boolean; onClose: () => void; termId: string; department: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState("");
  const m = useMutation({
    mutationFn: async () => api.post(`/api/academic/terms/${termId}/electives`, { department, name }),
    onSuccess: () => { toast("Group created. Add students from its roster.", { severity: "success" }); setName(""); void qc.invalidateQueries({ queryKey: ["academic"] }); onClose(); },
    onError: (e) => setError(apiErrorMessage(e, "Couldn't create the group.")),
  });
  return (
    <Dialog open={open} onClose={m.isPending ? undefined : onClose} maxWidth="xs" fullWidth aria-labelledby="elective-title">
      <DialogTitle id="elective-title">New elective group</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">A group for students from several sections who take the same subject. Students stay in their own section too.</Typography>
          <TextField size="small" label="Group name" placeholder="Cloud Computing" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={m.isPending}>Cancel</Button>
        <Button variant="contained" onClick={() => { setError(""); m.mutate(); }} disabled={m.isPending || !name.trim()}>{m.isPending ? "Creating…" : "Create group"}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── sub-mentors ──
export function SubMentorsDialog({ cls, staff, onClose }: { cls: ClassRow | null; staff: Staff[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [rows, setRows] = React.useState<SubMentor[]>([]);
  const [error, setError] = React.useState("");
  React.useEffect(() => { setRows(cls ? cls.subMentors.map(({ mentorId, from, to }) => ({ mentorId, from, to })) : []); setError(""); }, [cls]);
  const count = cls?.students ?? 0;
  const problems = rangeProblems(rows, count);
  const m = useMutation({
    mutationFn: async () => api.put(`/api/academic/classes/${cls!.id}/sub-mentors`, { ranges: rows }),
    onSuccess: () => { toast("Sub-mentors saved. Each student's mentor now follows their position.", { severity: "success" }); void qc.invalidateQueries({ queryKey: ["academic"] }); onClose(); },
    onError: (e) => setError(apiErrorMessage(e, "Couldn't save the sub-mentors.")),
  });
  const update = (i: number, patch: Partial<SubMentor>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Dialog open={!!cls} onClose={m.isPending ? undefined : onClose} maxWidth="sm" fullWidth aria-labelledby="sm-title">
      <DialogTitle id="sm-title">Sub-mentors: {cls?.label}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Students are numbered 1 to {count} in roll-number order. Give each sub-mentor a range (for example 1 to 24, then 25 to 48). Every position must be covered exactly once.
          </Typography>
          <Table size="small" aria-label="Sub-mentor ranges">
            <TableHead><TableRow><TableCell>Sub-mentor</TableCell><TableCell width={120}>From</TableCell><TableCell width={120}>To</TableCell><TableCell width={48} /></TableRow></TableHead>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell><StaffSelect label="Sub-mentor" value={r.mentorId} onChange={(v) => update(i, { mentorId: v })} staff={staff} /></TableCell>
                  <TableCell><TextField size="small" type="number" value={r.from} onChange={(e) => update(i, { from: Number(e.target.value) })} slotProps={{ htmlInput: { min: 1, "aria-label": "From position" } }} /></TableCell>
                  <TableCell><TextField size="small" type="number" value={r.to} onChange={(e) => update(i, { to: Number(e.target.value) })} slotProps={{ htmlInput: { min: 1, "aria-label": "To position" } }} /></TableCell>
                  <TableCell><IconButton size="small" aria-label="Remove this range" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><DeleteOutlineIcon fontSize="small" /></IconButton></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Stack direction="row" spacing={1}>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setRows((r) => [...r, { mentorId: "", from: (r.at(-1)?.to ?? 0) + 1, to: Math.min(count, (r.at(-1)?.to ?? 0) + 24) }])}>Add a range</Button>
            <Button size="small" variant="outlined" onClick={() => setRows(suggestRanges(count, rows.map((r) => r.mentorId)))} disabled={rows.filter((r) => r.mentorId).length === 0}>Split evenly (24 each) among the chosen</Button>
          </Stack>
          {rows.length > 0 && problems.length > 0 && <Alert severity="warning">{problems.join(" ")}</Alert>}
          {rows.length > 0 && problems.length === 0 && <Alert severity="success">Every position from 1 to {count} is covered once.</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={m.isPending}>Cancel</Button>
        <Button variant="contained" onClick={() => { setError(""); m.mutate(); }} disabled={m.isPending || rows.length === 0 || problems.length > 0}>{m.isPending ? "Saving…" : "Save sub-mentors"}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── teaching assignment: new, or reallocate ──
export function AssignmentDialog({ target, staff, onClose }: { target: { cls: ClassRow; reallocate?: { id: string; subject: string; facultyName: string | null } } | null; staff: Staff[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [facultyId, setFacultyId] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [date, setDate] = React.useState("");
  const [error, setError] = React.useState("");
  React.useEffect(() => { setFacultyId(""); setSubject(""); setDate(""); setError(""); }, [target]);
  const re = target?.reallocate;
  const m = useMutation({
    mutationFn: async () => {
      const when = date ? new Date(date).toISOString() : undefined;
      if (re) return api.post(`/api/academic/assignments/${re.id}/reallocate`, { new_faculty_id: facultyId, effective_from: when });
      return api.post(`/api/academic/classes/${target!.cls.id}/assignments`, { faculty_id: facultyId, subject, from: when });
    },
    onSuccess: () => { toast(re ? "Reallocated. Earlier work stays with the earlier teacher." : "Subject assigned.", { severity: "success" }); void qc.invalidateQueries({ queryKey: ["academic"] }); onClose(); },
    onError: (e) => setError(apiErrorMessage(e, "Couldn't save the assignment.")),
  });
  return (
    <Dialog open={!!target} onClose={m.isPending ? undefined : onClose} maxWidth="xs" fullWidth aria-labelledby="asg-title">
      <DialogTitle id="asg-title">{re ? `Reallocate ${re.subject}` : "Assign a subject"}: {target?.cls.label}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {re && <Typography variant="body2" color="text.secondary">{re.facultyName ?? "The current teacher"} stops teaching {re.subject} here at the date below, and the new teacher starts at the same moment. Nothing is deleted.</Typography>}
          <StaffSelect label={re ? "New teacher" : "Faculty member"} value={facultyId} onChange={setFacultyId} staff={staff.filter((s) => s.role !== "admin")} />
          {!re && <TextField size="small" label="Subject" placeholder="Python" value={subject} onChange={(e) => setSubject(e.target.value)} />}
          <TextField size="small" type="datetime-local" label={re ? "Takes effect" : "Starts (blank = now)"} value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={m.isPending}>Cancel</Button>
        <Button variant="contained" onClick={() => { setError(""); m.mutate(); }} disabled={m.isPending || !facultyId || (!re && !subject.trim())}>{m.isPending ? "Saving…" : re ? "Reallocate" : "Assign"}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── roster ──
export function RosterDialog({ cls, termId, classes, onClose }: { cls: ClassRow | null; termId: string; classes: ClassRow[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [addId, setAddId] = React.useState("");
  const q = useQuery<Roster>({
    queryKey: ["academic", "roster", cls?.id],
    queryFn: async () => (await api.get(`/api/academic/classes/${cls!.id}/roster`)).data.data,
    enabled: !!cls,
  });
  const move = useMutation({
    mutationFn: async ({ studentId, classId }: { studentId: string; classId: string }) => api.post(`/api/academic/classes/${classId}/students`, { term_id: termId, student_id: studentId }),
    onSuccess: () => { toast("Student moved.", { severity: "success" }); void qc.invalidateQueries({ queryKey: ["academic"] }); },
    onError: (e) => toast(apiErrorMessage(e, "Couldn't move the student."), { severity: "error" }),
  });
  const sections = classes.filter((c) => c.kind === "section" && c.id !== cls?.id);
  return (
    <Dialog open={!!cls} onClose={onClose} maxWidth="md" fullWidth aria-labelledby="roster-title">
      <DialogTitle id="roster-title">Students: {cls?.label}</DialogTitle>
      <DialogContent dividers>
        {q.isLoading ? <TableSkeleton rows={8} columns={4} /> : q.isError ? <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => q.refetch()}>Retry</Button>}>{apiErrorMessage(q.error, "Couldn't load the students.")}</Alert> : (
          <Stack spacing={2}>
            {cls?.kind === "elective" && (
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField size="small" label="Add a student by id" placeholder="student id" value={addId} onChange={(e) => setAddId(e.target.value)} />
                <Button size="small" variant="outlined" disabled={!addId.trim() || move.isPending} onClick={() => { move.mutate({ studentId: addId.trim(), classId: cls.id }); setAddId(""); }}>Add</Button>
              </Stack>
            )}
            <Table size="small" aria-label="Class list">
              <TableHead><TableRow><TableCell width={60}>No.</TableCell><TableCell>Student</TableCell><TableCell>Roll number</TableCell><TableCell>Mentor</TableCell>{cls?.kind === "section" && <TableCell>Move to</TableCell>}</TableRow></TableHead>
              <TableBody>
                {(q.data?.students ?? []).map((s) => {
                  const mentor = s.mentorId === cls?.classTeacher?.id ? cls?.classTeacher?.name : cls?.subMentors.find((r) => r.mentorId === s.mentorId)?.name;
                  return (
                    <TableRow key={s.id}>
                      <TableCell sx={{ fontVariantNumeric: "tabular-nums" }}>{s.position}</TableCell>
                      <TableCell>{s.name ?? s.id}{s.source && s.source !== "auto" ? <Typography component="span" variant="caption" color="text.secondary"> · {s.source === "csv" ? "from a list" : "placed by hand"}</Typography> : null}</TableCell>
                      <TableCell>{s.rollNo ?? "—"}</TableCell>
                      <TableCell>{mentor ?? "—"}</TableCell>
                      {cls?.kind === "section" && (
                        <TableCell>
                          <TextField select size="small" value="" onChange={(e) => move.mutate({ studentId: s.id, classId: e.target.value })} sx={{ minWidth: 150 }} slotProps={{ htmlInput: { "aria-label": `Move ${s.name ?? "student"} to another section` } }}>
                            {sections.map((c) => <MenuItem key={c.id} value={c.id}>{c.label}</MenuItem>)}
                          </TextField>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}><Button variant="contained" onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}
