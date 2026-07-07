"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Skeleton from "@mui/material/Skeleton";
import Avatar from "@mui/material/Avatar";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import { AddIcon, ContentCopyIcon, CheckIcon, CloseIcon, GroupsOutlinedIcon, SchoolOutlinedIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/States";

interface Classroom {
  id: string;
  name: string;
  department: string | null;
  section: string | null;
  join_code: string;
  member_count: number;
}
interface Member {
  id: string;
  name: string;
  email: string;
  roll_no: string | null;
  department: string | null;
  section: string | null;
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function MembersDialog({ classroom, onClose }: { classroom: Classroom | null; onClose: () => void }) {
  const [members, setMembers] = React.useState<Member[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!classroom) return;
    setLoading(true);
    setMembers([]);
    api
      .get(`/api/classrooms/${classroom.id}/members`)
      .then((r) => {
        if (r.data?.success) setMembers(r.data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [classroom]);

  return (
    <Dialog open={classroom != null} onClose={onClose} fullWidth maxWidth="sm">
      {classroom && (
        <>
          <DialogTitle sx={{ pr: 6 }}>
            {classroom.name} — Members
            <IconButton onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }} aria-label="Close">
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            {loading ? (
              <Stack spacing={1}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={44} />)}</Stack>
            ) : members.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                No students have joined yet.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {members.map((m) => (
                  <Stack key={m.id} direction="row" spacing={1.5} alignItems="center" sx={{ p: 1, borderRadius: 2, border: "1px solid", borderColor: "outlineVariant" }}>
                    <Avatar sx={{ width: 32, height: 32, fontSize: 12, bgcolor: "primaryContainer", color: "onPrimaryContainer" }}>{initials(m.name)}</Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={500} noWrap>{m.name}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>{m.roll_no ? `${m.roll_no} · ` : ""}{m.email}</Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            )}
          </DialogContent>
        </>
      )}
    </Dialog>
  );
}

export default function FacultyClassesPage() {
  const [classes, setClasses] = React.useState<Classroom[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [name, setName] = React.useState("");
  const [department, setDepartment] = React.useState("");
  const [section, setSection] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [viewing, setViewing] = React.useState<Classroom | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    api
      .get("/api/classrooms")
      .then((r) => {
        if (r.data?.success) setClasses(r.data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await api.post("/api/classrooms", {
        name: name.trim(),
        department: department.trim() || undefined,
        section: section.trim() || undefined,
      });
      setName("");
      setDepartment("");
      setSection("");
      load();
    } catch {
      /* ignore */
    } finally {
      setCreating(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(code);
        setTimeout(() => setCopied(null), 1500);
      })
      .catch(() => {});
  };

  return (
    <Box>
      <PageHeader title="Classes" subtitle="Create a class and share its join code — students enroll by entering it." />

      {/* Create form */}
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", mb: 3 }}>
        <CardContent>
          <Stack component="form" onSubmit={create} direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "stretch", sm: "flex-end" }}>
            <TextField label="Class name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CSE-A DSA 2025" size="small" sx={{ flex: 1 }} />
            <TextField label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="CSE" size="small" sx={{ width: { sm: 120 } }} />
            <TextField label="Section" value={section} onChange={(e) => setSection(e.target.value)} placeholder="A" size="small" sx={{ width: { sm: 90 } }} />
            <Button type="submit" variant="contained" startIcon={<AddIcon />} disabled={creating || !name.trim()} sx={{ minWidth: 120 }}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Class list */}
      {loading ? (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} variant="outlined" sx={{ p: 2.5, borderColor: "outlineVariant" }}>
              <Skeleton width="50%" height={24} />
              <Skeleton width="30%" height={18} sx={{ mt: 0.5 }} />
              <Skeleton height={40} sx={{ mt: 2 }} />
            </Card>
          ))}
        </Box>
      ) : classes.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState icon={<SchoolOutlinedIcon />} title="No classes yet" description="Create one above to get started." />
        </Card>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          {classes.map((c) => (
            <Card key={c.id} variant="outlined" sx={{ borderColor: "outlineVariant" }}>
              <CardContent>
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1} sx={{ mb: 2 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" fontWeight={600} noWrap>{c.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[c.department, c.section && `Sec ${c.section}`].filter(Boolean).join(" · ") || "No dept/section"}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "text.secondary", flexShrink: 0 }}>
                    <GroupsOutlinedIcon sx={{ fontSize: 16 }} />
                    <Typography variant="caption">{c.member_count}</Typography>
                  </Stack>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ flex: 1, px: 1.5, py: 1, borderRadius: 2, border: "1px solid", borderColor: "outlineVariant" }}
                  >
                    <Typography variant="caption" color="text.secondary">Join code</Typography>
                    <Typography variant="body2" fontWeight={700} sx={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.15em", color: "primary.main" }}>
                      {c.join_code}
                    </Typography>
                  </Stack>
                  <Tooltip title={copied === c.join_code ? "Copied" : "Copy code"}>
                    <IconButton onClick={() => copyCode(c.join_code)} aria-label="Copy join code">
                      {copied === c.join_code ? <CheckIcon fontSize="small" color="success" /> : <ContentCopyIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                </Stack>
                <Button fullWidth variant="outlined" size="small" onClick={() => setViewing(c)} sx={{ mt: 1.5 }}>
                  View members
                </Button>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      <MembersDialog classroom={viewing} onClose={() => setViewing(null)} />
    </Box>
  );
}
