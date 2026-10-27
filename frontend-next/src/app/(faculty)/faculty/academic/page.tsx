"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { getRole, getUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { CardGridSkeleton, ListSkeleton } from "@/components/ui/Skeletons";
import { useToast } from "@/components/feedback/ToastProvider";
import { radius } from "@/theme/tokens";
import { AddIcon, SchoolOutlinedIcon } from "@/components/ui/icons";
import {
  AssignmentDialog, ElectiveDialog, GenerateResultDialog, PlacementsDialog, RosterDialog, StaffSelect, SubMentorsDialog, TermDialog,
} from "@/components/faculty/academic/Dialogs";
import type { AccessRequest, ClassRow, GenerateResult, Issue, Staff, Term } from "@/components/faculty/academic/types";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "");

type TabKey = "classes" | "checks" | "requests";

export default function AcademicStructurePage() {
  const toast = useToast();
  const qc = useQueryClient();
  const role = getRole();
  const isAdmin = role === "admin";
  const myDepartment = getUser()?.department ?? "";

  const [tab, setTab] = React.useState<TabKey>("classes");
  const [termId, setTermId] = React.useState("");
  const [department, setDepartment] = React.useState(isAdmin ? "" : myDepartment);
  const [termDialog, setTermDialog] = React.useState(false);
  const [placeDialog, setPlaceDialog] = React.useState(false);
  const [electiveDialog, setElectiveDialog] = React.useState(false);
  const [generated, setGenerated] = React.useState<GenerateResult | null>(null);
  const [subTarget, setSubTarget] = React.useState<ClassRow | null>(null);
  const [rosterTarget, setRosterTarget] = React.useState<ClassRow | null>(null);
  const [asgTarget, setAsgTarget] = React.useState<{ cls: ClassRow; reallocate?: { id: string; subject: string; facultyName: string | null } } | null>(null);

  const terms = useQuery<Term[]>({ queryKey: ["academic", "terms"], queryFn: async () => (await api.get("/api/academic/terms")).data.data, staleTime: 30_000 });
  React.useEffect(() => {
    if (!termId && terms.data?.length) setTermId((terms.data.find((t) => t.status === "active") ?? terms.data[0]).id);
  }, [terms.data, termId]);
  const term = terms.data?.find((t) => t.id === termId);

  // Staff to pick from. For an Admin with no department chosen this is everyone, which also tells us which departments exist.
  const staffQ = useQuery<Staff[]>({
    queryKey: ["academic", "staff", department],
    queryFn: async () => (await api.get("/api/academic/staff", { params: department ? { department } : {} })).data.data,
    staleTime: 60_000,
  });
  const staff = React.useMemo(() => staffQ.data ?? [], [staffQ.data]);
  const departments = React.useMemo(() => (isAdmin ? [...new Set(staff.map((s) => s.department).filter((d): d is string => !!d))].sort() : []), [isAdmin, staff]);
  const [allDepartments, setAllDepartments] = React.useState<string[]>([]);
  React.useEffect(() => { if (departments.length > allDepartments.length) setAllDepartments(departments); }, [departments, allDepartments.length]);

  const needsDept = isAdmin && !department;
  const classesQ = useQuery<ClassRow[]>({
    queryKey: ["academic", "classes", termId, department],
    queryFn: async () => (await api.get(`/api/academic/terms/${termId}/classes`, { params: department ? { department } : {} })).data.data,
    enabled: !!termId && !needsDept,
  });
  const issuesQ = useQuery<{ issues: Issue[]; counts: { classes: number; students: number; issues: number } }>({
    queryKey: ["academic", "consistency", termId, department],
    queryFn: async () => (await api.get(`/api/academic/terms/${termId}/consistency`, { params: department ? { department } : {} })).data.data,
    enabled: !!termId && !needsDept && tab === "checks",
  });
  const requestsQ = useQuery<AccessRequest[]>({
    queryKey: ["academic", "requests"],
    queryFn: async () => (await api.get("/api/academic/requests")).data.data,
    enabled: tab === "requests",
  });
  const pending = (requestsQ.data ?? []).filter((r) => r.status === "pending");

  const activate = useMutation({
    mutationFn: async () => api.post(`/api/academic/terms/${termId}/activate`),
    onSuccess: () => { toast("This is now the active term.", { severity: "success" }); void qc.invalidateQueries({ queryKey: ["academic"] }); },
    onError: (e) => toast(apiErrorMessage(e, "Couldn't activate the term."), { severity: "error" }),
  });
  const generate = useMutation({
    mutationFn: async () => (await api.post(`/api/academic/terms/${termId}/generate`, { department })).data.data as GenerateResult,
    onSuccess: (r) => { setGenerated(r); void qc.invalidateQueries({ queryKey: ["academic"] }); },
    onError: (e) => toast(apiErrorMessage(e, "Couldn't build the classes."), { severity: "error" }),
  });
  const setTeacher = useMutation({
    mutationFn: async ({ classId, facultyId }: { classId: string; facultyId: string }) => api.put(`/api/academic/classes/${classId}/teacher`, { faculty_id: facultyId || null }),
    onSuccess: () => { toast("Class teacher saved.", { severity: "success" }); void qc.invalidateQueries({ queryKey: ["academic"] }); },
    onError: (e) => toast(apiErrorMessage(e, "Couldn't save the class teacher."), { severity: "error" }),
  });
  const endAsg = useMutation({
    mutationFn: async (id: string) => api.post(`/api/academic/assignments/${id}/end`, {}),
    onSuccess: () => { toast("Assignment ended.", { severity: "success" }); void qc.invalidateQueries({ queryKey: ["academic"] }); },
    onError: (e) => toast(apiErrorMessage(e, "Couldn't end the assignment."), { severity: "error" }),
  });

  const [decide, setDecide] = React.useState<{ req: AccessRequest; approve: boolean } | null>(null);
  const [days, setDays] = React.useState("30");
  const [note, setNote] = React.useState("");
  const decideM = useMutation({
    mutationFn: async () => api.post(`/api/academic/requests/${decide!.req.id}/decide`, {
      approve: decide!.approve, note: note || undefined,
      ...(decide!.approve && days !== "term" ? { expires_at: new Date(Date.now() + Number(days) * 86400000).toISOString() } : {}),
    }),
    onSuccess: () => { toast(decide!.approve ? "Access given." : "Request declined.", { severity: "success" }); setDecide(null); setNote(""); void qc.invalidateQueries({ queryKey: ["academic"] }); },
    onError: (e) => toast(apiErrorMessage(e, "Couldn't save the decision."), { severity: "error" }),
  });

  const classes = classesQ.data ?? [];
  const sectionClasses = classes.filter((c) => c.kind === "section");
  const electives = classes.filter((c) => c.kind === "elective");
  const noTerms = terms.isSuccess && (terms.data?.length ?? 0) === 0;

  return (
    <Stack>
      <PageHeader
        title="Academic structure"
        subtitle="Each semester's classes, who is the class teacher and sub-mentor, and which faculty teach which class."
        actions={isAdmin ? <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setTermDialog(true)}>New term</Button> : undefined}
      />

      <DataState loading={terms.isLoading} error={terms.isError ? terms.error : undefined} onRetry={() => terms.refetch()} skeleton={<ListSkeleton rows={3} />}
        empty={noTerms} emptyVariant="firstUse" emptyTitle="No term yet"
        emptyDescription={isAdmin ? "Create the first term (for example the 2026-27 odd semester), make it active, then each HOD builds their classes." : "An Admin has to create the term first."}
        emptyAction={isAdmin ? <Button variant="contained" onClick={() => setTermDialog(true)}>New term</Button> : undefined}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} sx={{ mb: 2 }}>
          <TextField select size="small" label="Term" value={termId} onChange={(e) => setTermId(e.target.value)} sx={{ minWidth: 240 }}>
            {(terms.data ?? []).map((t) => <MenuItem key={t.id} value={t.id}>{t.label}{t.status === "active" ? " (active)" : t.status === "closed" ? " (closed)" : ""}</MenuItem>)}
          </TextField>
          {isAdmin && (
            <TextField select size="small" label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} sx={{ minWidth: 200 }}>
              <MenuItem value="">Choose…</MenuItem>
              {allDepartments.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
            </TextField>
          )}
          {term && <Chip size="small" label={term.status === "active" ? "Active term" : term.status === "closed" ? "Closed" : "Planned"} color={term.status === "active" ? "success" : "default"} />}
          {term && <Typography variant="caption" color="text.secondary">{when(term.startDate)} to {when(term.endDate)}</Typography>}
          {isAdmin && term && term.status === "planned" && <Button size="small" variant="outlined" onClick={() => activate.mutate()} disabled={activate.isPending}>Make this the active term</Button>}
        </Stack>

        {term?.status === "closed" && <Alert severity="info" sx={{ mb: 2 }}>This term is closed. You can look at it, but nothing in it can be changed.</Alert>}
        {term?.status === "planned" && <Alert severity="info" sx={{ mb: 2 }}>This term has not started. You can prepare its classes now; faculty and students see them only once an Admin makes the term active.</Alert>}

        <Tabs value={tab} onChange={(_, v: TabKey) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: "outlineVariant" }} aria-label="Sections">
          <Tab value="classes" label="Classes" />
          <Tab value="checks" label="Checks" />
          <Tab value="requests" label={pending.length ? `Access requests (${pending.length})` : "Access requests"} />
        </Tabs>

        {tab === "classes" && (
          needsDept ? (
            <Alert severity="info">Choose a department to see and build its classes.</Alert>
          ) : (
            <>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
                <Button variant="contained" onClick={() => generate.mutate()} disabled={generate.isPending || term?.status === "closed"}>{generate.isPending ? "Building…" : "Build classes from students"}</Button>
                <Button variant="outlined" onClick={() => setPlaceDialog(true)} disabled={term?.status === "closed"}>Place students from a list</Button>
                <Button variant="outlined" onClick={() => setElectiveDialog(true)} disabled={term?.status === "closed"}>New elective group</Button>
              </Stack>
              <DataState loading={classesQ.isLoading} error={classesQ.isError ? classesQ.error : undefined} onRetry={() => classesQ.refetch()} skeleton={<CardGridSkeleton />}
                empty={classes.length === 0} emptyVariant="firstUse" emptyTitle="No classes yet"
                emptyDescription="Press “Build classes from students”. Classes are made from each student's department, year and section, and you can move anyone afterwards.">
                <Stack spacing={2}>
                  {[...sectionClasses, ...electives].map((c) => (
                    <Card key={c.id} variant="outlined" sx={{ borderColor: "outlineVariant", borderRadius: radius.md }}>
                      <CardContent>
                        <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between">
                          <Box>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <SchoolOutlinedIcon fontSize="small" />
                              <Typography variant="subtitle1" fontWeight={600}>{c.label}</Typography>
                              {c.kind === "elective" && <Chip size="small" label="Elective" />}
                            </Stack>
                            <Typography variant="body2" color="text.secondary">{c.students} student{c.students === 1 ? "" : "s"}</Typography>
                          </Box>
                          <Stack direction="row" spacing={1}>
                            <Button size="small" variant="outlined" onClick={() => setRosterTarget(c)}>Students</Button>
                            {c.kind === "section" && <Button size="small" variant="outlined" onClick={() => setSubTarget(c)} disabled={term?.status === "closed"}>Sub-mentors</Button>}
                            <Button size="small" variant="outlined" onClick={() => setAsgTarget({ cls: c })} disabled={term?.status === "closed"}>Assign a subject</Button>
                          </Stack>
                        </Stack>

                        <Stack spacing={1.5} sx={{ mt: 2 }}>
                          {c.kind === "section" && (
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
                              <StaffSelect label="Class teacher" value={c.classTeacher?.id ?? ""} onChange={(v) => setTeacher.mutate({ classId: c.id, facultyId: v })} staff={staff.filter((s) => !department || s.department === department || isAdmin)} allowNone fullWidth={false} />
                              {c.subMentors.length > 0 ? (
                                <Typography variant="body2" color="text.secondary">
                                  Sub-mentors: {c.subMentors.map((r) => `${r.name ?? "?"} (${r.from} to ${r.to})`).join(", ")}
                                </Typography>
                              ) : <Typography variant="body2" color="text.secondary">No sub-mentors set.</Typography>}
                            </Stack>
                          )}
                          {c.assignments.filter((a) => a.active).length > 0 && (
                            <Stack spacing={0.5}>
                              <Typography variant="caption" color="text.secondary" fontWeight={600}>Teaching now</Typography>
                              {c.assignments.filter((a) => a.active).map((a) => (
                                <Stack key={a.id} direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                                  <Typography variant="body2"><b>{a.subject}</b>: {a.facultyName ?? "Unknown"} <Typography component="span" variant="caption" color="text.secondary">since {when(a.from)}</Typography></Typography>
                                  <Button size="small" onClick={() => setAsgTarget({ cls: c, reallocate: { id: a.id, subject: a.subject, facultyName: a.facultyName } })} disabled={term?.status === "closed"}>Reallocate</Button>
                                  <Button size="small" color="error" onClick={() => endAsg.mutate(a.id)} disabled={endAsg.isPending || term?.status === "closed"}>End</Button>
                                </Stack>
                              ))}
                            </Stack>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </DataState>
            </>
          )
        )}

        {tab === "checks" && (
          needsDept ? <Alert severity="info">Choose a department to check.</Alert> : (
            <DataState loading={issuesQ.isLoading} error={issuesQ.isError ? issuesQ.error : undefined} onRetry={() => issuesQ.refetch()} skeleton={<ListSkeleton rows={4} />}
              empty={(issuesQ.data?.issues.length ?? 0) === 0} emptyVariant="unassigned" emptyTitle="Nothing to fix"
              emptyDescription={`${issuesQ.data?.counts.classes ?? 0} classes and ${issuesQ.data?.counts.students ?? 0} students checked: every student is in a class, every class has a teacher and its sub-mentor ranges cover it.`}>
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">{issuesQ.data?.issues.length} thing{issuesQ.data?.issues.length === 1 ? "" : "s"} to look at:</Typography>
                {(issuesQ.data?.issues ?? []).map((i, n) => <Alert key={n} severity={i.code === "EMPTY_CLASS" ? "info" : "warning"}>{i.message}</Alert>)}
              </Stack>
            </DataState>
          )
        )}

        {tab === "requests" && (
          <DataState loading={requestsQ.isLoading} error={requestsQ.isError ? requestsQ.error : undefined} onRetry={() => requestsQ.refetch()} skeleton={<ListSkeleton rows={3} />}
            empty={(requestsQ.data?.length ?? 0) === 0} emptyVariant="unassigned" emptyTitle="No requests"
            emptyDescription="When a faculty member asks for access to a class they do not teach, the request appears here for you to approve or decline.">
            <Stack spacing={1.5}>
              {(requestsQ.data ?? []).map((r) => (
                <Card key={r.id} variant="outlined" sx={{ borderColor: "outlineVariant", borderRadius: radius.md }}>
                  <CardContent>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between" alignItems={{ sm: "center" }}>
                      <Box>
                        <Typography variant="subtitle2" fontWeight={600}>{r.facultyName ?? r.facultyId} asks for {r.classLabel}</Typography>
                        <Typography variant="body2" color="text.secondary">{r.reason}</Typography>
                        {r.status !== "pending" && <Typography variant="caption" color="text.secondary">{r.status === "approved" ? "Approved" : "Declined"}{r.expiresAt ? ` until ${when(new Date(r.expiresAt).toISOString())}` : ""}{r.note ? `: ${r.note}` : ""}</Typography>}
                      </Box>
                      {r.status === "pending" ? (
                        <Stack direction="row" spacing={1}>
                          <Button size="small" variant="contained" onClick={() => setDecide({ req: r, approve: true })}>Approve</Button>
                          <Button size="small" variant="outlined" onClick={() => setDecide({ req: r, approve: false })}>Decline</Button>
                        </Stack>
                      ) : <Chip size="small" label={r.status === "approved" ? "Approved" : "Declined"} color={r.status === "approved" ? "success" : "default"} />}
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </DataState>
        )}
      </DataState>

      <TermDialog open={termDialog} onClose={() => setTermDialog(false)} onCreated={(id) => { setTermId(id); void qc.invalidateQueries({ queryKey: ["academic", "terms"] }); }} />
      <PlacementsDialog open={placeDialog} onClose={() => setPlaceDialog(false)} termId={termId} department={department} />
      <ElectiveDialog open={electiveDialog} onClose={() => setElectiveDialog(false)} termId={termId} department={department} />
      <GenerateResultDialog result={generated} onClose={() => setGenerated(null)} />
      <SubMentorsDialog cls={subTarget} staff={staff} onClose={() => setSubTarget(null)} />
      <AssignmentDialog target={asgTarget} staff={staff} onClose={() => setAsgTarget(null)} />
      <RosterDialog cls={rosterTarget} termId={termId} classes={classes} onClose={() => setRosterTarget(null)} />

      <Dialog open={!!decide} onClose={decideM.isPending ? undefined : () => setDecide(null)} maxWidth="xs" fullWidth aria-labelledby="decide-title">
        <DialogTitle id="decide-title">{decide?.approve ? "Give access" : "Decline request"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2">{decide?.req.facultyName} asked for {decide?.req.classLabel}: “{decide?.req.reason}”</Typography>
            {decide?.approve && (
              <TextField select size="small" label="Access lasts" value={days} onChange={(e) => setDays(e.target.value)}>
                <MenuItem value="7">7 days</MenuItem><MenuItem value="30">30 days</MenuItem><MenuItem value="90">90 days</MenuItem><MenuItem value="180">180 days</MenuItem>
                <MenuItem value="term">Until the term is closed</MenuItem>
              </TextField>
            )}
            <TextField size="small" label="Note to the faculty member (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDecide(null)} disabled={decideM.isPending}>Cancel</Button>
          <Button variant="contained" onClick={() => decideM.mutate()} disabled={decideM.isPending}>{decideM.isPending ? "Saving…" : decide?.approve ? "Give access" : "Decline"}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
