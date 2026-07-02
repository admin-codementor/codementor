"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import api from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchField } from "@/components/ui/SearchField";
import { EmptyState } from "@/components/ui/States";
import { useToast } from "@/components/feedback/ToastProvider";

interface Faculty {
  id: string;
  name: string;
  email: string;
  permissions: Record<string, boolean>;
}

const PERM_LABELS: Record<string, string> = {
  manage_problems: "Manage Problems",
  manage_assignments: "Manage Assignments",
  manage_students: "View Students",
  export_data: "Export Data",
  generate_ai_tests: "AI Test Generator",
  run_plagiarism: "Run Plagiarism",
  manage_contests: "Manage Contests",
};

export default function FacultyPermissionsPage() {
  const [faculty, setFaculty] = React.useState<Faculty[]>([]);
  const [allPerms, setAllPerms] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState<Record<string, boolean>>({});
  const showToast = useToast();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/faculty/faculty-list");
      if (res.data?.success) {
        setFaculty(res.data.data);
        setAllPerms(res.data.allPermissions || Object.keys(PERM_LABELS));
      }
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err?.response?.data?.error || "Failed to load faculty", { severity: "error" });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const toggle = (facultyId: string, perm: string) => {
    setFaculty((prev) => prev.map((f) => (f.id === facultyId ? { ...f, permissions: { ...f.permissions, [perm]: !f.permissions[perm] } } : f)));
    setDirty((d) => ({ ...d, [facultyId]: true }));
  };

  const save = async (f: Faculty) => {
    setSavingId(f.id);
    try {
      await api.patch(`/api/faculty/permissions/${f.id}`, { permissions: f.permissions });
      setDirty((d) => {
        const n = { ...d };
        delete n[f.id];
        return n;
      });
      showToast(`Saved permissions for ${f.name}`);
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err?.response?.data?.error || "Save failed", { severity: "error" });
    } finally {
      setSavingId(null);
    }
  };

  const filtered = faculty.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()) || f.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <Box>
      <PageHeader
        title="Faculty Permissions"
        subtitle="Grant or revoke capabilities per faculty member. Changes take effect on their next login (token refresh)."
      />

      <SearchField value={search} onChange={setSearch} placeholder="Search faculty…" label="Search faculty" sx={{ mb: 3, maxWidth: 360 }} />

      {loading ? (
        <Stack spacing={2}>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} variant="rounded" height={110} />)}</Stack>
      ) : filtered.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState icon={<AdminPanelSettingsOutlinedIcon />} title={search ? "No matching faculty" : "No faculty found"} />
        </Card>
      ) : (
        <Stack spacing={2}>
          {filtered.map((f) => (
            <Card key={f.id} variant="outlined" sx={{ borderColor: "outlineVariant" }}>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>{f.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{f.email}</Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    startIcon={<SaveOutlinedIcon />}
                    disabled={!dirty[f.id] || savingId === f.id}
                    onClick={() => save(f)}
                  >
                    {savingId === f.id ? "Saving…" : dirty[f.id] ? "Save" : "Saved"}
                  </Button>
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {allPerms.map((p) => {
                    const on = !!f.permissions[p];
                    return (
                      <Chip
                        key={p}
                        icon={on ? <CheckIcon /> : <CloseIcon />}
                        label={PERM_LABELS[p] || p}
                        onClick={() => toggle(f.id, p)}
                        variant={on ? "filled" : "outlined"}
                        sx={{
                          cursor: "pointer",
                          fontWeight: 500,
                          bgcolor: on ? "primaryContainer" : "transparent",
                          color: on ? "onPrimaryContainer" : "text.secondary",
                          borderColor: on ? "transparent" : "outlineVariant",
                          "& .MuiChip-icon": { color: "inherit" },
                        }}
                      />
                    );
                  })}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </Box>
  );
}
