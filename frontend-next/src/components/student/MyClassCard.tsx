"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { SchoolOutlinedIcon } from "@/components/ui/icons";
import { radius } from "@/theme/tokens";

interface Person { id: string; name: string | null }
interface MyClass {
  term: { id: string; label: string } | null;
  class: { id: string; label: string } | null;
  classTeacher?: Person | null; subMentor?: Person | null; position?: number | null; electives?: { id: string; name: string }[];
}

/** Which class the student is in this term, and who looks after them. Shows nothing when no term is running or they have no class yet. */
export function MyClassCard() {
  const q = useQuery<MyClass>({ queryKey: ["academic", "me"], queryFn: async () => (await api.get("/api/academic/me")).data.data, staleTime: 5 * 60_000, retry: false });
  const d = q.data;
  if (!d?.class) return null;
  return (
    <Card variant="outlined" sx={{ borderColor: "outlineVariant", borderRadius: radius.md }}>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <SchoolOutlinedIcon fontSize="small" />
          <Typography variant="subtitle1" fontWeight={600}>My class</Typography>
          {d.term && <Typography variant="caption" color="text.secondary">{d.term.label}</Typography>}
        </Stack>
        <Typography variant="h6" component="p" sx={{ mb: 1.5 }}>{d.class.label}</Typography>
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Class teacher</Typography>
            <Typography variant="body2" fontWeight={600}>{d.classTeacher?.name ?? "Not set yet"}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Your sub-mentor</Typography>
            <Typography variant="body2" fontWeight={600}>{d.subMentor?.name ?? "Not set yet"}</Typography>
          </Box>
        </Box>
        {(d.electives?.length ?? 0) > 0 && (
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
            {d.electives!.map((e) => <Chip key={e.id} size="small" variant="outlined" label={e.name} />)}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
