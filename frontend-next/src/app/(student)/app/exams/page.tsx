"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import { AssignmentOutlinedIcon, AccessTimeIcon, EmojiEventsOutlinedIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/States";
import { Reveal } from "@/components/ui/motion";

interface ExamCard {
  id: string;
  title: string;
  description: string | null;
  window_start: string;
  window_end: string;
  duration_minutes: number;
  section_count: number;
  started: boolean;
  attempted: boolean;
  score: number | null;
  total: number | null;
}

function windowStatus(startIso: string, endIso: string): { label: string; tone: "default" | "warning" | "error" } {
  const now = Date.now();
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (now < start) return { label: `Opens ${new Date(startIso).toLocaleString()}`, tone: "default" };
  if (now > end) return { label: "Window closed", tone: "error" };
  return { label: `Closes ${new Date(endIso).toLocaleString()}`, tone: "warning" };
}

export default function StudentExamsPage() {
  const router = useRouter();
  const [exams, setExams] = React.useState<ExamCard[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    api.get("/api/exams/available")
      .then((r) => { if (r.data?.success) setExams(r.data.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <Box>
      <PageHeader
        title="Exams"
        subtitle="Timed, multi-section assessments — MCQ and coding sections in one exam."
      />
      {loading ? (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} variant="outlined" sx={{ p: 2.5, borderColor: "outlineVariant" }}>
              <Skeleton width="40%" />
              <Skeleton width="70%" height={28} sx={{ mt: 1 }} />
              <Skeleton width="100%" height={36} sx={{ mt: 2 }} />
            </Card>
          ))}
        </Box>
      ) : exams.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState icon={<AssignmentOutlinedIcon />} title="No exams published yet" description="Check back soon." />
        </Card>
      ) : (
        <Reveal>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            {exams.map((e) => {
              const status = windowStatus(e.window_start, e.window_end);
              const closed = status.tone === "error";
              return (
                <Card key={e.id} variant="outlined" sx={{ borderColor: "outlineVariant" }}>
                  <CardContent>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                      <Chip
                        label={status.label} size="small"
                        sx={{
                          fontSize: 10, height: 20,
                          bgcolor: status.tone === "error" ? "errorContainer" : status.tone === "warning" ? "warningContainer" : "surfaceContainerHigh",
                          color: status.tone === "error" ? "onErrorContainer" : status.tone === "warning" ? "onWarningContainer" : "onSurfaceVariant",
                        }}
                      />
                      {e.attempted && (
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "success.main" }}>
                          <EmojiEventsOutlinedIcon sx={{ fontSize: 16 }} />
                          <Typography variant="caption" sx={{ fontFamily: "ui-monospace, monospace" }}>
                            {e.score}/{e.total}
                          </Typography>
                        </Stack>
                      )}
                    </Stack>
                    <Typography variant="subtitle1" fontWeight={600}>{e.title}</Typography>
                    {e.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {e.description}
                      </Typography>
                    )}
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        {e.section_count} section{e.section_count === 1 ? "" : "s"}
                      </Typography>
                      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "text.secondary" }}>
                        <AccessTimeIcon sx={{ fontSize: 14 }} />
                        <Typography variant="caption">{e.duration_minutes} min</Typography>
                      </Stack>
                    </Stack>
                    <Button
                      fullWidth variant="contained" sx={{ mt: 2 }}
                      onClick={() => router.push(`/app/exams/${e.id}`)}
                      disabled={e.attempted ? false : closed}
                      color={e.attempted ? "primary" : "primary"}
                    >
                      {e.attempted ? "View Result" : e.started ? "Resume Exam" : closed ? "Window Closed" : "Start Exam"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        </Reveal>
      )}
    </Box>
  );
}
