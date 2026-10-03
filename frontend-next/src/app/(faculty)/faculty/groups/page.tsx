"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchField } from "@/components/ui/SearchField";
import { EmptyState } from "@/components/ui/States";
import { useToast } from "@/components/feedback/ToastProvider";
import { useConfirm } from "@/components/feedback/ConfirmProvider";
import { interactiveSurfaceSx } from "@/components/ui/interactive";
import { AddIcon, DeleteOutlineIcon, EditOutlinedIcon, GroupsOutlinedIcon } from "@/components/ui/icons";

interface GroupRow {
  id: string; name: string; description: string; student_count: number;
  owner_name: string | null; created_at: string | null; can_edit: boolean;
}
interface Candidate {
  id: string; name: string; roll_no: string | null;
  department: string | null; section: string | null; year: number | null;
}
interface GroupDetail extends GroupRow {
  student_ids: string[];
  members: Candidate[];
  hidden_member_count: number;
}

function MemberPicker({
  candidates, selected, onToggle, onBulk,
}: {
  candidates: Candidate[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onBulk: (ids: string[], add: boolean) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [dept, setDept] = React.useState("");
  const [section, setSection] = React.useState("");

  const departments = React.useMemo(() => [...new Set(candidates.map((c) => c.department).filter(Boolean))].sort() as string[], [candidates]);
  const sections = React.useMemo(() => [...new Set(candidates.map((c) => c.section).filter(Boolean))].sort() as string[], [candidates]);

  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((c) =>
      (!dept || c.department === dept)
      && (!section || c.section === section)
      && (!q || c.name.toLowerCase().includes(q) || (c.roll_no ?? "").toLowerCase().includes(q)));
  }, [candidates, search, dept, section]);

  const allVisibleSelected = visible.length > 0 && visible.every((c) => selected.has(c.id));

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <SearchField value={search} onChange={setSearch} placeholder="Search name or roll no…" label="Search students" sx={{ flex: 1 }} />
        <TextField select size="small" label="Branch" value={dept} onChange={(e) => setDept(e.target.value)} sx={{ minWidth: 130 }}>
          <MenuItem value="">All</MenuItem>
          {departments.map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Section" value={section} onChange={(e) => setSection(e.target.value)} sx={{ minWidth: 120 }}>
          <MenuItem value="">All</MenuItem>
          {sections.map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}
        </TextField>
      </Stack>

      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="caption" color="text.secondary">
          {visible.length} shown · {selected.size} selected
        </Typography>
        <Button size="small" onClick={() => onBulk(visible.map((c) => c.id), !allVisibleSelected)} disabled={visible.length === 0}>
          {allVisibleSelected ? "Deselect shown" : "Select all shown"}
        </Button>
      </Stack>

      <Box sx={{ maxHeight: 340, overflowY: "auto", border: "1px solid", borderColor: "outlineVariant", borderRadius: 2 }}>
        {visible.length === 0 ? (
          <EmptyState title="No students match" description="Try clearing the branch or section filter." />
        ) : (
          <List dense disablePadding>
            {visible.map((c) => (
              <ListItemButton key={c.id} onClick={() => onToggle(c.id)} dense>
                <Checkbox edge="start" checked={selected.has(c.id)} tabIndex={-1} disableRipple size="small" />
                <ListItemText
                  primary={c.name}
                  secondary={[c.roll_no, c.department, c.section ? `Sec ${c.section}` : null, c.year ? `Year ${c.year}` : null].filter(Boolean).join(" · ")}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary">
        A group can mix branches and sections — that is what makes it different from a class.
      </Typography>
    </Stack>
  );
}

export default function GroupsPage() {
  const qc = useQueryClient();
  const showToast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = React.useState<GroupDetail | "new" | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const groupsQuery = useQuery<GroupRow[]>({
    queryKey: ["faculty", "groups"],
    queryFn: async () => (await api.get("/api/faculty/groups")).data.data,
  });
  const candidatesQuery = useQuery<Candidate[]>({
    queryKey: ["faculty", "group-candidates"],
    queryFn: async () => (await api.get("/api/faculty/groups-candidates")).data.data,
    enabled: editing !== null,
  });

  const openNew = () => { setName(""); setDescription(""); setSelected(new Set()); setEditing("new"); };
  const openEdit = async (id: string) => {
    try {
      const d: GroupDetail = (await api.get(`/api/faculty/groups/${id}`)).data.data;
      setName(d.name);
      setDescription(d.description);
      setSelected(new Set(d.student_ids));
      setEditing(d);
    } catch (e) {
      showToast(apiErrorMessage(e, "Couldn't open that group."), { severity: "error" });
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = { name, description, student_ids: [...selected] };
      if (editing === "new") return (await api.post("/api/faculty/groups", body)).data;
      return (await api.patch(`/api/faculty/groups/${(editing as GroupDetail).id}`, body)).data;
    },
    onSuccess: () => {
      showToast(editing === "new" ? "Group created" : "Group updated", { severity: "success" });
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["faculty", "groups"] });
    },
    onError: (e) => showToast(apiErrorMessage(e, "Couldn't save the group."), { severity: "error" }),
  });

  const remove = async (g: GroupRow) => {
    const ok = await confirm({
      title: `Delete "${g.name}"?`,
      description: `This removes the group and its ${g.student_count} member${g.student_count === 1 ? "" : "s"}. Exams already targeted at it will no longer reach them. Students themselves are not affected.`,
      confirmLabel: "Delete group",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/faculty/groups/${g.id}`);
      showToast("Group deleted", { severity: "success" });
      qc.invalidateQueries({ queryKey: ["faculty", "groups"] });
    } catch (e) {
      showToast(apiErrorMessage(e, "Couldn't delete the group."), { severity: "error" });
    }
  };

  const groups = groupsQuery.data ?? [];

  return (
    <Stack>
      <PageHeader
        title="Student groups"
        subtitle="Custom cohorts that can span sections and branches — target exams at a group instead of a whole class."
        actions={<Button variant="contained" startIcon={<AddIcon />} onClick={openNew}>New group</Button>}
      />

      {groupsQuery.isError ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => groupsQuery.refetch()}>Retry</Button>}>
          {apiErrorMessage(groupsQuery.error, "Couldn't load groups.")}
        </Alert>
      ) : groupsQuery.isLoading ? (
        <Stack spacing={2}>{[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={88} />)}</Stack>
      ) : groups.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState
            icon={<GroupsOutlinedIcon />}
            title="No groups yet"
            description="Create a group to pull together students from different sections or branches — a placement batch, or a cohort that needs extra support."
            action={<Button variant="contained" startIcon={<AddIcon />} onClick={openNew}>New group</Button>}
          />
        </Card>
      ) : (
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
          {groups.map((g) => (
            <Card key={g.id} variant="outlined" sx={{ borderColor: "outlineVariant", p: 2.5, ...(g.can_edit ? interactiveSurfaceSx : {}) }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle1" fontWeight={600} noWrap>{g.name}</Typography>
                  {g.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{g.description}</Typography>
                  )}
                  <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
                    <Chip size="small" label={`${g.student_count} student${g.student_count === 1 ? "" : "s"}`} sx={{ bgcolor: "primaryContainer", color: "onPrimaryContainer" }} />
                    {g.owner_name && <Chip size="small" label={`by ${g.owner_name}`} sx={{ bgcolor: "surfaceContainerHigh", color: "onSurfaceVariant" }} />}
                  </Stack>
                </Box>
                {g.can_edit && (
                  <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                    <Tooltip title="Edit group">
                      <IconButton size="small" aria-label={`Edit ${g.name}`} onClick={() => openEdit(g.id)}><EditOutlinedIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Delete group">
                      <IconButton size="small" aria-label={`Delete ${g.name}`} color="error" onClick={() => remove(g)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  </Stack>
                )}
              </Stack>
            </Card>
          ))}
        </Box>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} fullWidth maxWidth="md">
        <DialogTitle>{editing === "new" ? "New group" : "Edit group"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <TextField label="Group name" value={name} onChange={(e) => setName(e.target.value)} fullWidth required autoFocus />
            <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline rows={2} placeholder="What is this group for?" />
            {editing !== "new" && (editing as GroupDetail)?.hidden_member_count > 0 && (
              <Alert severity="info">
                {(editing as GroupDetail).hidden_member_count} member(s) from other departments are in this group but not shown.
                They will be kept when you save.
              </Alert>
            )}
            {candidatesQuery.isLoading ? (
              <Skeleton variant="rounded" height={300} />
            ) : (
              <MemberPicker
                candidates={candidatesQuery.data ?? []}
                selected={selected}
                onToggle={(id) => setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return next;
                })}
                onBulk={(ids, add) => setSelected((prev) => {
                  const next = new Set(prev);
                  ids.forEach((id) => (add ? next.add(id) : next.delete(id)));
                  return next;
                })}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            {save.isPending ? "Saving…" : editing === "new" ? "Create group" : "Save changes"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
