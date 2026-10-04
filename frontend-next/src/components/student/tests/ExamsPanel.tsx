"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import {
  AssignmentOutlinedIcon, CheckCircleOutlineIcon, EmojiEventsOutlinedIcon, TimerOutlinedIcon, WarningAmberIcon,
} from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/States";
import { Reveal } from "@/components/ui/motion";
import { KpiRow } from "@/components/analytics/layout";
import { KpiTile } from "@/components/analytics/KpiTile";
import { averageExamPct, examStatus, useAvailableExamsQuery, type ExamCardData, type ExamStatus } from "@/lib/queries/student";

type TabKey = "active" | "completed" | "missed";

const TAB_STATUSES: Record<TabKey, ExamStatus[]> = {
  active: ["live", "upcoming"],
  completed: ["completed"],
  missed: ["missed"],
};

const EMPTY: Record<TabKey, { title: string; description: string }> = {
  active: { title: "Nothing scheduled", description: "When faculty publishes an exam for you it appears here with its window and duration." },
  completed: { title: "No completed exams yet", description: "Finished exams show up here with your score." },
  missed: { title: "No missed exams", description: "You're all caught up." },
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const STATUS_CHIP: Record<ExamStatus, { label: string; bg: string; fg: string }> = {
  live: { label: "Live now", bg: "warningContainer", fg: "onWarningContainer" },
  upcoming: { label: "Upcoming", bg: "surfaceContainerHigh", fg: "onSurfaceVariant" },
  completed: { label: "Completed", bg: "successContainer", fg: "onSuccessContainer" },
  missed: { label: "Missed", bg: "errorContainer", fg: "onErrorContainer" },
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{label}</Typography>
      <Typography variant="body2" fontWeight={500}>{value}</Typography>
    </Box>
  );
}

function ExamCard({ exam, status, onOpen }: { exam: ExamCardData; status: ExamStatus; onOpen: () => void }) {
  const chip = STATUS_CHIP[status];
  const pct = exam.attempted && exam.total ? Math.round(((exam.score ?? 0) / exam.total) * 100) : null;
  const action =
    status === "completed" ? "View result" : exam.started ? "Resume exam" : status === "live" ? "Start exam" : status === "upcoming" ? "Not open yet" : "Window closed";
  return (
    <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Chip label={chip.label} size="small" sx={{ fontSize: 11, height: 22, bgcolor: chip.bg, color: chip.fg }} />
          {pct != null && (
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "success.main" }}>
              <EmojiEventsOutlinedIcon sx={{ fontSize: 16 }} />
              <Typography variant="caption" fontWeight={600}>{exam.score}/{exam.total} · {pct}%</Typography>
            </Stack>
          )}
        </Stack>
        <Typography variant="subtitle1" fontWeight={600}>{exam.title}</Typography>
        {exam.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {exam.description}
          </Typography>
        )}
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mt: 2 }}>
          <Field label="Opens" value={fmt(exam.window_start)} />
          <Field label="Closes" value={fmt(exam.window_end)} />
          <Field label="Duration" value={`${exam.duration_minutes} min`} />
          <Field label="Sections" value={exam.section_count} />
        </Box>
        <Button
          fullWidth
          variant={status === "live" ? "contained" : "outlined"}
          sx={{ mt: 2 }}
          onClick={onOpen}
          disabled={status === "missed" || status === "upcoming"}
        >
          {action}
        </Button>
      </CardContent>
    </Card>
  );
}

/** The Exams tab of the Tests hub. */
export function ExamsPanel() {
  const router = useRouter();
  const { data, isLoading } = useAvailableExamsQuery();
  const [tab, setTab] = React.useState<TabKey>("active");

  const exams = React.useMemo(() => data ?? [], [data]);
  const withStatus = React.useMemo(() => exams.map((e) => ({ exam: e, status: examStatus(e) })), [exams]);
  const count = (s: ExamStatus) => withStatus.filter((x) => x.status === s).length;
  const avg = averageExamPct(exams);
  const visible = withStatus.filter((x) => TAB_STATUSES[tab].includes(x.status));
  const tabCount = (k: TabKey) => withStatus.filter((x) => TAB_STATUSES[k].includes(x.status)).length;

  return (
    <Box>
      <KpiRow min={150}>
        <KpiTile icon={<AssignmentOutlinedIcon />} label="Total exams" value={exams.length} loading={isLoading} />
        <KpiTile icon={<TimerOutlinedIcon />} label="Upcoming & live" value={count("upcoming") + count("live")} accent="warning" loading={isLoading} />
        <KpiTile icon={<CheckCircleOutlineIcon />} label="Completed" value={count("completed")} accent="success" loading={isLoading} />
        <KpiTile icon={<WarningAmberIcon />} label="Missed" value={count("missed")} accent="error" loading={isLoading} />
        <KpiTile icon={<EmojiEventsOutlinedIcon />} label="Average score" value={avg ?? "—"} suffix={avg != null ? "%" : undefined} accent="tertiary" loading={isLoading} />
      </KpiRow>

      <Tabs value={tab} onChange={(_, v: TabKey) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: "outlineVariant" }} aria-label="Exam status">
        <Tab value="active" label={`Upcoming & live (${tabCount("active")})`} />
        <Tab value="completed" label={`Completed (${tabCount("completed")})`} />
        <Tab value="missed" label={`Missed (${tabCount("missed")})`} />
      </Tabs>

      {isLoading ? (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} variant="outlined" sx={{ p: 2.5, borderColor: "outlineVariant" }}>
              <Skeleton width="40%" />
              <Skeleton width="70%" height={28} sx={{ mt: 1 }} />
              <Skeleton width="100%" height={36} sx={{ mt: 2 }} />
            </Card>
          ))}
        </Box>
      ) : visible.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState icon={<AssignmentOutlinedIcon />} title={EMPTY[tab].title} description={EMPTY[tab].description} />
        </Card>
      ) : (
        <Reveal>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
            {visible.map(({ exam, status }) => (
              <ExamCard key={exam.id} exam={exam} status={status} onOpen={() => router.push(`/app/exams/${exam.id}`)} />
            ))}
          </Box>
        </Reveal>
      )}
    </Box>
  );
}
