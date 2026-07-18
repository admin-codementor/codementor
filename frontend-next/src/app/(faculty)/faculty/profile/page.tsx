"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import {
  EditOutlinedIcon,
  CheckIcon,
  CloseIcon,
  LockOutlinedIcon,
  GroupsOutlinedIcon,
  BoltOutlinedIcon,
  DescriptionOutlinedIcon,
  TrackChangesOutlinedIcon,
  CodeOutlinedIcon,
  AdminPanelSettingsOutlinedIcon,
} from "@/components/ui/icons";
import api from "@/lib/api";
import { getUser } from "@/lib/auth";
import { changeFirebasePassword } from "@/lib/firebase";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { SectionCard } from "@/components/ui/SectionCard";
import { TwoFactorSetup } from "@/components/auth/TwoFactorSetup";

interface FacultyStats {
  totalStudents: number;
  activeStudents: number;
  totalSubs: number;
  acRate: number;
  problemsSolved: number;
}

const DEFAULT_STATS: FacultyStats = {
  totalStudents: 0,
  activeStudents: 0,
  totalSubs: 0,
  acRate: 0,
  problemsSolved: 0,
};

function initialsOf(name?: string) {
  if (!name) return "FA";
  return name.split(" ").filter(Boolean).map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export default function FacultyProfilePage() {
  const [user, setUserState] = React.useState<ReturnType<typeof getUser>>(null);
  const [stats, setStats] = React.useState<FacultyStats>(DEFAULT_STATS);
  const [loading, setLoading] = React.useState(true);

  const isAdmin = user?.role === "admin";

  // Name edit
  const [editingName, setEditingName] = React.useState(false);
  const [nameVal, setNameVal] = React.useState("");
  const [nameLoading, setNameLoading] = React.useState(false);
  const [nameMsg, setNameMsg] = React.useState<{ text: string; ok: boolean } | null>(null);

  // Password
  const [pwForm, setPwForm] = React.useState({ current: "", next: "", confirm: "" });
  const [pwLoading, setPwLoading] = React.useState(false);
  const [pwMsg, setPwMsg] = React.useState<{ text: string; ok: boolean } | null>(null);

  React.useEffect(() => {
    const u = getUser();
    setUserState(u);
    setNameVal(u?.name ?? "");

    api
      .get("/api/faculty/dashboard")
      .then((r) => {
        const s = r.data?.data?.stats;
        if (s) setStats({ ...DEFAULT_STATS, ...s });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleNameSave = async () => {
    if (!nameVal.trim()) return;
    setNameLoading(true);
    setNameMsg(null);
    try {
      await api.put("/api/student/profile", { name: nameVal.trim() });
      const updated = { ...(user ?? {}), name: nameVal.trim() };
      localStorage.setItem("user", JSON.stringify(updated));
      setUserState(updated as ReturnType<typeof getUser>);
      setNameMsg({ text: "Name updated", ok: true });
      setEditingName(false);
    } catch {
      setNameMsg({ text: "Failed to update name", ok: false });
    } finally {
      setNameLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!pwForm.current || !pwForm.next || !pwForm.confirm) {
      setPwMsg({ text: "All fields are required", ok: false });
      return;
    }
    if (pwForm.next !== pwForm.confirm) {
      setPwMsg({ text: "Passwords do not match", ok: false });
      return;
    }
    if (pwForm.next.length < 6) {
      setPwMsg({ text: "Password must be at least 6 characters", ok: false });
      return;
    }
    setPwLoading(true);
    setPwMsg(null);
    try {
      await changeFirebasePassword(pwForm.current, pwForm.next);
      setPwMsg({ text: "Password changed successfully", ok: true });
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      const text =
        code === "auth/wrong-password" || code === "auth/invalid-credential"
          ? "Current password is incorrect"
          : (e as Error)?.message || "Failed to change password";
      setPwMsg({ text, ok: false });
    } finally {
      setPwLoading(false);
    }
  };

  const activePct = stats.totalStudents > 0 ? Math.round((stats.activeStudents / stats.totalStudents) * 100) : 0;

  return (
    <Box>
      <PageHeader
        title="My Profile"
        subtitle={isAdmin ? "Administrator account and platform overview." : "Your teaching account and class overview."}
      />

      <Stack spacing={3}>
        {/* Identity header */}
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <CardContent>
            <Stack direction="row" spacing={2.5} alignItems="flex-start" flexWrap="wrap" useFlexGap>
              <Avatar sx={{ width: 64, height: 64, fontSize: 24, fontWeight: 700, bgcolor: isAdmin ? "tertiary" : "primary.main", color: isAdmin ? "onTertiary" : "primary.contrastText" }}>
                {initialsOf(user?.name)}
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {editingName ? (
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <TextField
                      value={nameVal}
                      onChange={(e) => setNameVal(e.target.value)}
                      size="small"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleNameSave();
                        if (e.key === "Escape") setEditingName(false);
                      }}
                    />
                    <IconButton size="small" color="primary" onClick={handleNameSave} disabled={nameLoading} aria-label="Save name">
                      <CheckIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => setEditingName(false)} aria-label="Cancel">
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ) : (
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Typography variant="h5" fontWeight={700}>
                      {user?.name || "Faculty"}
                    </Typography>
                    <IconButton size="small" onClick={() => setEditingName(true)} aria-label="Edit name">
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                )}
                {nameMsg && (
                  <Typography variant="caption" color={nameMsg.ok ? "success.main" : "error.main"}>
                    {nameMsg.text}
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary">
                  {user?.email || ""}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, flexWrap: "wrap", gap: 1 }}>
                  <Chip
                    icon={isAdmin ? <AdminPanelSettingsOutlinedIcon /> : undefined}
                    label={isAdmin ? "Administrator" : "Faculty"}
                    size="small"
                    sx={{
                      textTransform: "capitalize",
                      fontWeight: 600,
                      bgcolor: isAdmin ? "tertiaryContainer" : "secondaryContainer",
                      color: isAdmin ? "onTertiaryContainer" : "onSecondaryContainer",
                    }}
                  />
                  {user?.department && (
                    <Chip label={user.department} size="small" variant="outlined" sx={{ borderColor: "outlineVariant" }} />
                  )}
                </Stack>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {/* Faculty/admin stat cards */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(5, 1fr)" }, gap: 2 }}>
          <StatCard icon={<GroupsOutlinedIcon />} label={isAdmin ? "Students" : "My Students"} value={loading ? "—" : stats.totalStudents} accent="primary" />
          <StatCard icon={<BoltOutlinedIcon />} label="Active (7d)" value={loading ? "—" : stats.activeStudents} helper={loading ? undefined : `${activePct}%`} accent="warning" />
          <StatCard icon={<DescriptionOutlinedIcon />} label="Submissions" value={loading ? "—" : stats.totalSubs} accent="tertiary" />
          <StatCard icon={<TrackChangesOutlinedIcon />} label="AC Rate" value={loading ? "—" : `${stats.acRate}%`} accent="success" />
          <StatCard icon={<CodeOutlinedIcon />} label="Problems Solved" value={loading ? "—" : stats.problemsSolved} accent="secondary" />
        </Box>

        {/* Change Password */}
        <SectionCard title="Change Password" icon={<LockOutlinedIcon sx={{ color: "text.secondary", fontSize: 20 }} />}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
            <TextField type="password" label="Current Password" size="small" value={pwForm.current} onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))} autoComplete="current-password" />
            <TextField type="password" label="New Password" size="small" value={pwForm.next} onChange={(e) => setPwForm((p) => ({ ...p, next: e.target.value }))} helperText="Min 6 characters" autoComplete="new-password" />
            <TextField type="password" label="Confirm New" size="small" value={pwForm.confirm} onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))} autoComplete="new-password" />
          </Box>
          {pwMsg && (
            <Alert severity={pwMsg.ok ? "success" : "error"} sx={{ mt: 2 }}>
              {pwMsg.text}
            </Alert>
          )}
          <Button variant="contained" onClick={handlePasswordChange} disabled={pwLoading} sx={{ mt: 2 }}>
            {pwLoading ? "Updating…" : "Update Password"}
          </Button>
        </SectionCard>

        {/* 2FA */}
        <SectionCard title="Two-Factor Authentication" icon={<LockOutlinedIcon sx={{ color: "text.secondary", fontSize: 20 }} />}>
          <Divider sx={{ mb: 2, borderColor: "outlineVariant" }} />
          <TwoFactorSetup />
        </SectionCard>
      </Stack>
    </Box>
  );
}
