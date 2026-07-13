"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import LinearProgress from "@mui/material/LinearProgress";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { ResponsiveBar } from "@nivo/bar";
import { ResponsiveLine } from "@nivo/line";
import { ResponsivePie } from "@nivo/pie";
import {
  ArrowBackIcon,
  PersonOutlineIcon,
  GroupsOutlinedIcon,
  TrackChangesOutlinedIcon,
  InsightsOutlinedIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  LayersOutlinedIcon,
  LocalFireDepartmentOutlinedIcon,
  HistoryOutlinedIcon,
  CodeOutlinedIcon,
  HubOutlinedIcon,
  CheckCircleOutlineIcon,
  ErrorOutlineIcon,
  LinkOutlinedIcon,
} from "@/components/ui/icons";
import api from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { ActivityHeatmap } from "@/components/ui/ActivityHeatmap";
import { useNivoTheme, useChartColors } from "@/components/ui/nivo";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/motion";
import { CODING_PLATFORM_META } from "@/lib/codingPlatforms";

interface TopicScore {
  topic: string;
  solvedCount: number;
  failedCount: number;
  hintUsageCount: number;
  attempts: number;
  acRate: number;
  reason: string;
}

interface StudentProfile {
  student: {
    id: string;
    name: string;
    email: string;
    department: string | null;
    section: string | null;
    year: number | null;
    rollNo: string | null;
    rating: number | null;
    lastLoginAt: string | null;
    joinedDate: string;
  };
  totals: { total: number; accepted: number; solved: number; acRate: number };
  learningCurve: { date: string; solved: number }[];
  topicBreakdown: { topic: string; solved: number; attempts: number }[];
  verdictBreakdown: { name: string; value: number }[];
  difficultyProgression: { difficulty: string; solved: number }[];
  submissionVelocity: { week: string; count: number }[];
  activityHeatmap: { date: string; count: number }[];
  ratingHistory: { contestId: string | null; contestTitle: string; oldRating: number; newRating: number; rank: number; createdAt: string }[];
  languages: { language: string; count: number }[];
  strengths: TopicScore[];
  weaknesses: TopicScore[];
  codingProfiles: {
    platform: string;
    handle: string;
    solved: number;
    rating: number | null;
    maxRating: number | null;
    syncStatus: string;
    lastSynced: string | null;
  }[];
  highlights: {
    topTopic: string | null;
    weakTopic: string | null;
    topLanguage: string | null;
    busiestDay: string | null;
    currentStreak: number;
    externalSolved: number;
  };
}

const DIFFICULTY_ORDER = ["Easy", "Medium", "Hard"];

function TopicScoreRow({ item, tone }: { item: TopicScore; tone: "success" | "warning" }) {
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
        <Typography variant="body2" fontWeight={600}>
          {item.topic}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {item.acRate}%
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={item.acRate}
        color={tone}
        sx={{ height: 6, borderRadius: 3, mb: 0.5 }}
      />
      <Typography variant="caption" color="text.secondary">
        {item.reason}
      </Typography>
    </Box>
  );
}

function PlatformStatusIcon({ status }: { status: string }) {
  if (status === "ok") return <CheckCircleOutlineIcon sx={{ fontSize: 16, color: "success.main" }} />;
  if (status === "error") return <ErrorOutlineIcon sx={{ fontSize: 16, color: "error.main" }} />;
  return <LinkOutlinedIcon sx={{ fontSize: 16, color: "text.secondary" }} />;
}

export default function StudentProfilePage() {
  const params = useParams<{ id: string }>();
  const studentId = params.id;
  const nivoTheme = useNivoTheme();
  const colors = useChartColors();

  const [data, setData] = React.useState<StudentProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(false);
    api
      .get(`/api/faculty/students/${studentId}/detail`)
      .then((r) => {
        if (r.data?.success) setData(r.data.data);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [studentId]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Tooltip title="Back">
          <IconButton component="a" href="/faculty/analytics" size="small" aria-label="Back to analytics">
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      <PageHeader
        title={loading ? "Loading…" : data ? data.student.name : "Student not found"}
        subtitle={
          data
            ? `${data.student.rollNo ?? "No roll no."} · ${data.student.department ?? "—"}${data.student.section ? ` · Section ${data.student.section}` : ""}${data.student.year ? ` · Year ${data.student.year}` : ""}`
            : undefined
        }
      />

      {loading && (
        <Stack spacing={2}>
          <Skeleton variant="rounded" height={96} />
          <Skeleton variant="rounded" height={260} />
        </Stack>
      )}

      {!loading && error && (
        <ErrorState onRetry={load} description="We couldn't load this student's profile. You may be outside your department scope." />
      )}

      {!loading && !error && data && (
        <Stack spacing={3}>
          <RevealGroup>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
              <RevealItem><StatCard icon={<PersonOutlineIcon />} label="Problems Solved" value={data.totals.solved} accent="primary" /></RevealItem>
              <RevealItem><StatCard icon={<GroupsOutlinedIcon />} label="Submissions" value={data.totals.total} accent="tertiary" /></RevealItem>
              <RevealItem><StatCard icon={<TrackChangesOutlinedIcon />} label="AC Rate" value={`${data.totals.acRate}%`} accent="success" /></RevealItem>
              <RevealItem><StatCard icon={<InsightsOutlinedIcon />} label="Rating" value={data.student.rating ?? 1200} accent="warning" /></RevealItem>
            </Box>
          </RevealGroup>

          <RevealGroup>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
              <RevealItem>
                <StatCard icon={<LocalFireDepartmentOutlinedIcon />} label="Current Streak" value={`${data.highlights.currentStreak}d`} accent="error" />
              </RevealItem>
              <RevealItem>
                <StatCard icon={<TrendingUpIcon />} label="Strongest Topic" value={data.highlights.topTopic ?? "—"} accent="success" />
              </RevealItem>
              <RevealItem>
                <StatCard icon={<TrendingDownIcon />} label="Weakest Topic" value={data.highlights.weakTopic ?? "—"} accent="warning" />
              </RevealItem>
              <RevealItem>
                <StatCard icon={<CodeOutlinedIcon />} label="Top Language" value={data.highlights.topLanguage ?? "—"} accent="secondary" />
              </RevealItem>
              <RevealItem>
                <StatCard icon={<HubOutlinedIcon />} label="External Solved" value={data.highlights.externalSolved} helper="Across synced platforms" accent="primary" />
              </RevealItem>
            </Box>
          </RevealGroup>

          {/* Strengths & weaknesses */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
            <Reveal>
              <SectionCard title="Strengths" icon={<TrendingUpIcon sx={{ fontSize: 20, color: "success.main" }} />}>
                {data.strengths.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                    Not enough attempts yet to identify strengths.
                  </Typography>
                ) : (
                  <Stack spacing={2}>
                    {data.strengths.map((s) => (
                      <TopicScoreRow key={s.topic} item={s} tone="success" />
                    ))}
                  </Stack>
                )}
              </SectionCard>
            </Reveal>
            <Reveal>
              <SectionCard title="Weaknesses" icon={<TrendingDownIcon sx={{ fontSize: 20, color: "warning.main" }} />}>
                {data.weaknesses.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                    Not enough attempts yet to identify weak spots.
                  </Typography>
                ) : (
                  <Stack spacing={2}>
                    {data.weaknesses.map((s) => (
                      <TopicScoreRow key={s.topic} item={s} tone="warning" />
                    ))}
                  </Stack>
                )}
              </SectionCard>
            </Reveal>
          </Box>

          {/* Progress: learning curve + submission velocity */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 3 }}>
            <Reveal>
              <SectionCard title="Learning curve (cumulative solved)">
                {data.learningCurve.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>No accepted submissions yet.</Typography>
                ) : (
                  <Box sx={{ height: 260 }}>
                    <ResponsiveLine
                      data={[{ id: "solved", data: data.learningCurve.map((p) => ({ x: p.date, y: p.solved })) }]}
                      margin={{ top: 16, right: 20, bottom: 40, left: 44 }}
                      xScale={{ type: "point" }}
                      yScale={{ type: "linear", min: 0, max: "auto" }}
                      curve="monotoneX"
                      colors={[colors[0]]}
                      theme={nivoTheme}
                      enableArea
                      areaOpacity={0.12}
                      enablePoints={false}
                      enableGridX={false}
                      axisBottom={{ tickSize: 0, tickPadding: 8, tickRotation: -35 }}
                      axisLeft={{ tickSize: 0, tickPadding: 8 }}
                      useMesh
                    />
                  </Box>
                )}
              </SectionCard>
            </Reveal>

            <Reveal>
              <SectionCard title="Submission velocity (last 12 weeks)" icon={<InsightsOutlinedIcon sx={{ fontSize: 20, color: "text.secondary" }} />}>
                {data.submissionVelocity.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>No recent activity.</Typography>
                ) : (
                  <Box sx={{ height: 260 }}>
                    <ResponsiveBar
                      data={data.submissionVelocity.map((v) => ({ week: v.week, count: v.count }))}
                      keys={["count"]}
                      indexBy="week"
                      margin={{ top: 16, right: 16, bottom: 44, left: 44 }}
                      padding={0.35}
                      borderRadius={6}
                      colors={[colors[1]]}
                      theme={nivoTheme}
                      enableLabel={false}
                      axisLeft={{ tickSize: 0, tickPadding: 8 }}
                      axisBottom={{ tickSize: 0, tickPadding: 8, tickRotation: -35 }}
                    />
                  </Box>
                )}
              </SectionCard>
            </Reveal>
          </Box>

          {/* Difficulty progression + verdict mix */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 3 }}>
            <Reveal>
              <SectionCard title="Difficulty progression" icon={<LayersOutlinedIcon sx={{ fontSize: 20, color: "text.secondary" }} />}>
                {data.difficultyProgression.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>No accepted submissions yet.</Typography>
                ) : (
                  <Box sx={{ height: 220 }}>
                    <ResponsiveBar
                      data={[...data.difficultyProgression].sort(
                        (a, b) => DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty)
                      )}
                      keys={["solved"]}
                      indexBy="difficulty"
                      margin={{ top: 16, right: 16, bottom: 32, left: 44 }}
                      padding={0.4}
                      borderRadius={6}
                      colors={[colors[2], colors[3], colors[4]]}
                      colorBy="indexValue"
                      theme={nivoTheme}
                      enableLabel
                      axisLeft={{ tickSize: 0, tickPadding: 8 }}
                      axisBottom={{ tickSize: 0, tickPadding: 8 }}
                    />
                  </Box>
                )}
              </SectionCard>
            </Reveal>

            <Reveal>
              <SectionCard title="Verdict mix">
                {data.verdictBreakdown.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>No submissions yet.</Typography>
                ) : (
                  <Box sx={{ height: 220 }}>
                    <ResponsivePie
                      data={data.verdictBreakdown.map((v) => ({ id: v.name, label: v.name, value: v.value }))}
                      margin={{ top: 16, right: 16, bottom: 16, left: 16 }}
                      innerRadius={0.55}
                      padAngle={1.2}
                      cornerRadius={4}
                      colors={colors}
                      theme={nivoTheme}
                      borderWidth={0}
                      enableArcLinkLabels={false}
                      arcLabelsSkipAngle={16}
                    />
                  </Box>
                )}
              </SectionCard>
            </Reveal>
          </Box>

          {/* Topic breakdown */}
          <Reveal>
            <SectionCard title="Topic breakdown (solved vs attempts)">
              {data.topicBreakdown.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>No topic activity yet.</Typography>
              ) : (
                <Box sx={{ height: 320 }}>
                  <ResponsiveBar
                    data={data.topicBreakdown.map((t) => ({ topic: t.topic, Solved: t.solved, Attempts: t.attempts }))}
                    keys={["Solved", "Attempts"]}
                    indexBy="topic"
                    groupMode="grouped"
                    margin={{ top: 16, right: 16, bottom: 64, left: 44 }}
                    padding={0.3}
                    borderRadius={4}
                    colors={[colors[2], colors[5]]}
                    theme={nivoTheme}
                    enableLabel={false}
                    axisLeft={{ tickSize: 0, tickPadding: 8 }}
                    axisBottom={{ tickSize: 0, tickPadding: 8, tickRotation: -35 }}
                    legends={[{ dataFrom: "keys", anchor: "top-right", direction: "row", translateY: -12, itemWidth: 80, itemHeight: 16, symbolSize: 12, symbolShape: "circle" }]}
                  />
                </Box>
              )}
            </SectionCard>
          </Reveal>

          {/* Activity heatmap */}
          <Reveal>
            <SectionCard title="Activity — last 12 months">
              {data.activityHeatmap.length === 0 ? (
                <EmptyState icon={<GroupsOutlinedIcon />} title="No activity yet" />
              ) : (
                <ActivityHeatmap heatmap={data.activityHeatmap} days={365} />
              )}
            </SectionCard>
          </Reveal>

          {/* Third-party coding platforms */}
          <Reveal>
            <SectionCard title="Third-party coding profiles" icon={<HubOutlinedIcon sx={{ fontSize: 20, color: "text.secondary" }} />}>
              {data.codingProfiles.length === 0 ? (
                <EmptyState icon={<HubOutlinedIcon />} title="No external profiles linked" description="This student hasn't linked any LeetCode, Codeforces, or other coding-platform handles yet." />
              ) : (
                <Stack spacing={2}>
                  {data.codingProfiles.map((p) => {
                    const meta = CODING_PLATFORM_META[p.platform] ?? { label: p.platform, live: false };
                    return (
                      <Stack key={p.platform} direction="row" spacing={1.5} alignItems="center">
                        <Box sx={{ width: 120, flexShrink: 0 }}>
                          <Typography variant="body2" fontWeight={500}>{meta.label}</Typography>
                          <Typography variant="caption" color="text.secondary">@{p.handle}</Typography>
                        </Box>
                        <Box sx={{ flex: 1 }} />
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <PlatformStatusIcon status={p.syncStatus} />
                          {meta.live && p.syncStatus === "ok" ? (
                            <Typography variant="caption" sx={{ fontFamily: "ui-monospace, monospace" }}>
                              {p.solved} solved{p.rating ? ` · ${p.rating} rating` : ""}{p.maxRating ? ` (peak ${p.maxRating})` : ""}
                            </Typography>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              {p.syncStatus === "error" ? "sync failed" : "link only"}
                            </Typography>
                          )}
                        </Stack>
                      </Stack>
                    );
                  })}
                </Stack>
              )}
            </SectionCard>
          </Reveal>

          {/* Rating history */}
          <Reveal>
            <SectionCard title="Contest rating history" icon={<HistoryOutlinedIcon sx={{ fontSize: 20, color: "text.secondary" }} />}>
              {data.ratingHistory.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>No contest participation yet.</Typography>
              ) : (
                <Stack spacing={1.5}>
                  <Box sx={{ height: 200 }}>
                    <ResponsiveLine
                      data={[{ id: "rating", data: data.ratingHistory.map((r) => ({ x: r.contestTitle, y: r.newRating })) }]}
                      margin={{ top: 16, right: 20, bottom: 40, left: 44 }}
                      xScale={{ type: "point" }}
                      yScale={{ type: "linear", min: "auto", max: "auto" }}
                      curve="monotoneX"
                      colors={[colors[3]]}
                      theme={nivoTheme}
                      enablePoints
                      pointSize={6}
                      enableGridX={false}
                      axisBottom={null}
                      axisLeft={{ tickSize: 0, tickPadding: 8 }}
                      useMesh
                    />
                  </Box>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {data.ratingHistory.slice(-8).reverse().map((r, i) => (
                      <Chip
                        key={`${r.contestId}-${i}`}
                        size="small"
                        variant="outlined"
                        sx={{ borderColor: "outlineVariant" }}
                        label={`${r.contestTitle}: ${r.oldRating} → ${r.newRating} (#${r.rank})`}
                      />
                    ))}
                  </Stack>
                </Stack>
              )}
            </SectionCard>
          </Reveal>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {data.student.department && <Chip label={data.student.department} size="small" variant="outlined" sx={{ borderColor: "outlineVariant" }} />}
            {data.student.year && <Chip label={`Year ${data.student.year}`} size="small" variant="outlined" sx={{ borderColor: "outlineVariant" }} />}
            {data.student.section && <Chip label={`Section ${data.student.section}`} size="small" variant="outlined" sx={{ borderColor: "outlineVariant" }} />}
            {data.student.lastLoginAt && (
              <Chip label={`Last active ${new Date(data.student.lastLoginAt).toLocaleDateString()}`} size="small" variant="outlined" sx={{ borderColor: "outlineVariant" }} />
            )}
          </Stack>
        </Stack>
      )}
    </Box>
  );
}
