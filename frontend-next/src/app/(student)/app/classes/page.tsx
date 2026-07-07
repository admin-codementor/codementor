"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Avatar from "@mui/material/Avatar";
import { LoginIcon, SchoolOutlinedIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/States";
import { useToast } from "@/components/feedback/ToastProvider";

interface JoinedClass {
  id: string;
  name: string;
  department: string | null;
  section: string | null;
  faculty_name: string;
  joined_at: string;
}

function classInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export default function ClassesPage() {
  const [classes, setClasses] = React.useState<JoinedClass[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [code, setCode] = React.useState("");
  const [joining, setJoining] = React.useState(false);
  const showToast = useToast();

  const load = React.useCallback(() => {
    setLoading(true);
    api
      .get<{ success: boolean; data: JoinedClass[] }>("/api/classrooms")
      .then((r) => {
        if (r.data?.success) setClasses(r.data.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setJoining(true);
    try {
      const r = await api.post("/api/classrooms/join", { code: code.trim() });
      if (r.data?.success) {
        showToast(`Joined "${r.data.data.name}"`);
        setCode("");
        load();
      }
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      showToast(error?.response?.data?.error || "Could not join class", { severity: "error" });
    } finally {
      setJoining(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title="My Classes"
        subtitle="Enter the join code shared by your faculty to enroll in a class."
      />

      {/* Join box */}
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", mb: 3 }}>
        <CardContent>
          <Stack
            component="form"
            onSubmit={join}
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems={{ xs: "stretch", sm: "flex-start" }}
          >
            <TextField
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              label="Join code"
              placeholder="e.g. 7KQ9PX"
              size="small"
              slotProps={{ htmlInput: { maxLength: 12, style: { letterSpacing: "0.2em", fontFamily: "ui-monospace, monospace" } } }}
              sx={{ flex: 1, minWidth: { sm: 200 } }}
            />
            <Button
              type="submit"
              variant="contained"
              startIcon={<LoginIcon />}
              disabled={joining || !code.trim()}
              sx={{ minWidth: 120 }}
            >
              {joining ? "Joining…" : "Join"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Class list */}
      {loading ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 2,
          }}
        >
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} variant="outlined" sx={{ p: 2.5, borderColor: "outlineVariant" }}>
              <Skeleton width="50%" height={24} />
              <Skeleton width="30%" height={18} sx={{ mt: 0.5 }} />
              <Skeleton width="40%" height={18} sx={{ mt: 2 }} />
            </Card>
          ))}
        </Box>
      ) : classes.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState
            icon={<SchoolOutlinedIcon />}
            title="No classes yet"
            description="Once you join a class with a code, it'll appear here."
          />
        </Card>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 2,
          }}
        >
          {classes.map((c) => (
            <Card key={c.id} variant="outlined" sx={{ borderColor: "outlineVariant" }}>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="flex-start">
                  <Avatar sx={{ bgcolor: "primaryContainer", color: "onPrimaryContainer", fontWeight: 600 }}>
                    {classInitials(c.name)}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" fontWeight={600} noWrap>
                      {c.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[c.department, c.section && `Sec ${c.section}`].filter(Boolean).join(" · ") || "—"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                      Faculty:{" "}
                      <Box component="span" sx={{ color: "text.primary", fontWeight: 500 }}>
                        {c.faculty_name}
                      </Box>
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
}
