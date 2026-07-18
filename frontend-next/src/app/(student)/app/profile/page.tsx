"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
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
import Skeleton from "@mui/material/Skeleton";
import LinearProgress from "@mui/material/LinearProgress";
import Tooltip from "@mui/material/Tooltip";
import Divider from "@mui/material/Divider";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import { EditOutlinedIcon, CheckIcon, CloseIcon, CodeOutlinedIcon, LocalFireDepartmentOutlinedIcon, EmojiEventsOutlinedIcon, TrackChangesOutlinedIcon, LockOutlinedIcon, PersonOutlineIcon, HistoryOutlinedIcon, HubOutlinedIcon, CodeOffOutlinedIcon, BugReportOutlinedIcon, CancelOutlinedIcon, TrendingUpIcon, TrendingDownIcon, LayersOutlinedIcon } from "@/components/ui/icons";
import { ResponsivePie } from "@nivo/pie";
import { useNivoTheme, useChartColors } from "@/components/ui/nivo";
import { Reveal } from "@/components/ui/motion";
import api from "@/lib/api";
import { getUser } from "@/lib/auth";
import { changeFirebasePassword } from "@/lib/firebase";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { SectionCard } from "@/components/ui/SectionCard";
import { RatingBadge } from "@/components/ui/RatingBadge";
import { TwoFactorSetup } from "@/components/auth/TwoFactorSetup";
import { ProfileSubmissions } from "@/components/profile/ProfileSubmissions";
import { ProfileCodingProfiles } from "@/components/profile/ProfileCodingProfiles";
import type { DashboardStats, TopicMastery } from "@/lib/types";

interface LanguageRow {
  language: string;
  count: number | string;
}
interface RatingHistoryRow {
  id: string;
  contest_title: string;
  old_rating: number;
  new_rating: number;
  delta: number;
  rank: number;
  created_at: string;
}
interface Badge {
  key: string;
  label: string;
  icon: string;
  desc: string;
  earned: boolean;
  progress: number;
  cur: number;
  target: number;
}
interface TopicScore {
  topic: string;
  solvedCount: number;
  failedCount: number;
  acRate: number;
  reason: string;
}
interface SkillsData {
  strengths: TopicScore[];
  weaknesses: TopicScore[];
  difficultyProgression: { difficulty: string; solved: number }[];
}

const DEFAULT_STATS: DashboardStats = {
  totalSubs: 0,
  acRate: 0,
  problemsSolved: 0,
  streak: 0,
  rank: 0,
  rating: 1200,
};

type StatPeriod = "all" | "7d" | "30d" | "6mo";
const PERIODS: { value: StatPeriod; label: string }[] = [
  { value: "all", label: "Overall" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "6mo", label: "6 Months" },
];
interface StatsData {
  period: string;
  total: number;
  verdicts: { verdict: string | null; n: number }[];
  languages: { language: string; n: number }[];
}

const TABS = ["overview", "submissions", "coding-profiles", "account"] as const;
type TabKey = (typeof TABS)[number];

function initialsOf(name?: string) {
  if (!name) return "ST";
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ── Labeled progress bar ────────────────────────────────────────────────────────

function ProgressRow({
  label,
  detail,
  pct,
  color,
}: {
  label: string;
  detail: string;
  pct: number;
  color: "primary" | "success" | "warning";
}) {
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="body2" fontWeight={500} sx={{ textTransform: "capitalize" }}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "ui-monospace, monospace" }}>
          {detail}
        </Typography>
      </Stack>
      <LinearProgress variant="determinate" value={Math.min(100, pct)} color={color} sx={{ height: 8, borderRadius: 4 }} />
    </Box>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function ProfileInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const nivoTheme = useNivoTheme();
  const chartColors = useChartColors();
  const tabParam = searchParams.get("tab");
  const tab: TabKey = (TABS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as TabKey)
    : "overview";

  const [user, setUserState] = React.useState<ReturnType<typeof getUser>>(null);
  const [stats, setStats] = React.useState<DashboardStats>(DEFAULT_STATS);
  const [topics, setTopics] = React.useState<TopicMastery[]>([]);
  const [languages, setLanguages] = React.useState<LanguageRow[]>([]);
  const [ratingHistory, setRatingHistory] = React.useState<RatingHistoryRow[]>([]);
  const [badges, setBadges] = React.useState<Badge[]>([]);
  const [skills, setSkills] = React.useState<SkillsData | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Submission-quality stats (period-filtered) for the Overview dashboard.
  const [period, setPeriod] = React.useState<StatPeriod>("all");
  const [statsData, setStatsData] = React.useState<StatsData | null>(null);

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
      .get("/api/student/dashboard")
      .then((r) => {
        const d = r.data?.data;
        if (d) {
          setStats(d.stats ?? DEFAULT_STATS);
          setTopics(d.topics ?? []);
          setLanguages(d.languages ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    if (u?.id != null) {
      api
        .get(`/api/rating/user/${u.id}`)
        .then((r) => {
          if (r.data?.success) setRatingHistory(r.data.data.history ?? []);
        })
        .catch(() => {});
    }

    api
      .get("/api/student/badges")
      .then((r) => {
        if (r.data?.success) setBadges(r.data.data.badges ?? []);
      })
      .catch(() => {});

    api
      .get("/api/student/skills")
      .then((r) => {
        if (r.data?.success) setSkills(r.data.data);
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    api
      .get(`/api/student/stats?period=${period}`)
      .then((r) => {
        if (r.data?.success) setStatsData(r.data.data);
      })
      .catch(() => {});
  }, [period]);

  const changeTab = (next: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

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

  const totalLangSubs = languages.reduce((s, l) => s + Number(l.count), 0) || 1;
  const topTopics = [...topics].sort((a, b) => b.mastery - a.mastery).slice(0, 8);
  const earnedBadges = badges.filter((b) => b.earned).length;

  // ── Submission-quality breakdown (from /api/student/stats) ──
  const vmap = new Map((statsData?.verdicts ?? []).map((v) => [v.verdict ?? "Unknown", v.n]));
  const vget = (k: string) => vmap.get(k) ?? 0;
  const vAccepted = vget("Accepted");
  const vWrong = vget("Wrong Answer");
  const vCompile = vget("Compilation Error");
  const vExec =
    vget("Runtime Error") +
    vget("Runtime Error (NZEC)") +
    vget("Time Limit Exceeded") +
    vget("Memory Limit Exceeded");
  const vTotal = statsData?.total ?? 0;
  const vOther = Math.max(0, vTotal - vAccepted - vWrong - vCompile - vExec);
  const verdictPie = [
    { id: "Accepted", value: vAccepted, label: "Accepted", color: chartColors[2] },
    { id: "Wrong Answer", value: vWrong, label: "Wrong Answer", color: chartColors[4] },
    { id: "Execution Failed", value: vExec, label: "Execution Failed", color: chartColors[3] },
    { id: "Compilation Error", value: vCompile, label: "Compilation Error", color: chartColors[1] },
    { id: "Other", value: vOther, label: "Other", color: chartColors[5] },
  ].filter((s) => s.value > 0);

  return (
    <Box>
      <PageHeader title="Profile" subtitle="Your stats, achievements, submissions, and account." />

      {/* Identity header — persists across tabs */}
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={2.5} alignItems="flex-start" flexWrap="wrap" useFlexGap>
            <Avatar sx={{ width: 64, height: 64, fontSize: 24, fontWeight: 700, bgcolor: "primary.main", color: "primary.contrastText" }}>
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
                    {user?.name || "Student"}
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
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                <Chip
                  label={user?.role || "student"}
                  size="small"
                  sx={{ textTransform: "capitalize", bgcolor: "secondaryContainer", color: "onSecondaryContainer", fontWeight: 600 }}
                />
                {!loading && <RatingBadge rating={stats.rating} />}
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v: TabKey) => changeTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ mb: 3, borderBottom: "1px solid", borderColor: "outlineVariant", minHeight: 48 }}
      >
        <Tab value="overview" icon={<PersonOutlineIcon fontSize="small" />} iconPosition="start" label="Overview" sx={{ minHeight: 48, textTransform: "none" }} />
        <Tab value="submissions" icon={<HistoryOutlinedIcon fontSize="small" />} iconPosition="start" label="Submissions" sx={{ minHeight: 48, textTransform: "none" }} />
        <Tab value="coding-profiles" icon={<HubOutlinedIcon fontSize="small" />} iconPosition="start" label="Coding Profiles" sx={{ minHeight: 48, textTransform: "none" }} />
        <Tab value="account" icon={<LockOutlinedIcon fontSize="small" />} iconPosition="start" label="Account" sx={{ minHeight: 48, textTransform: "none" }} />
      </Tabs>

      {/* ── Overview ── */}
      {tab === "overview" && (
        <Stack spacing={3}>
          <Stack direction="row" justifyContent="flex-end">
            <SegmentedButtons<StatPeriod>
              value={period}
              onChange={setPeriod}
              segments={PERIODS}
              ariaLabel="Stats time period"
            />
          </Stack>

          <Reveal>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", xl: "repeat(4, 1fr)" }, gap: 2 }}>
              <StatCard icon={<CodeOutlinedIcon />} label="Problems Solved" value={loading ? "—" : stats.problemsSolved} accent="primary" />
              <StatCard icon={<LocalFireDepartmentOutlinedIcon />} label="Day Streak" value={loading ? "—" : stats.streak} accent="warning" />
              <StatCard icon={<EmojiEventsOutlinedIcon />} label="Global Rank" value={loading ? "—" : stats.rank > 0 ? `#${stats.rank}` : "—"} accent="tertiary" />
              <StatCard icon={<TrackChangesOutlinedIcon />} label="AC Rate" value={loading ? "—" : `${stats.acRate}%`} accent="success" />
            </Box>
          </Reveal>

          {/* Submission breakdown (period-filtered) */}
          <SectionCard title="Submission Breakdown">
            {vTotal === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                No submissions in this period.
              </Typography>
            ) : (
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3, alignItems: "center" }}>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                  <StatCard icon={<CancelOutlinedIcon />} label="Wrong Answers" value={vWrong} accent="error" />
                  <StatCard icon={<BugReportOutlinedIcon />} label="Execution Failed" value={vExec} accent="warning" />
                  <StatCard icon={<CodeOffOutlinedIcon />} label="Compilation Errors" value={vCompile} accent="tertiary" />
                  <StatCard icon={<TrackChangesOutlinedIcon />} label="Total" value={vTotal} accent="primary" />
                </Box>
                <Box>
                  <Box sx={{ height: 200 }}>
                    <ResponsivePie
                      data={verdictPie.map((s) => ({ id: s.id, label: s.label, value: s.value, color: s.color }))}
                      margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      innerRadius={0.6}
                      padAngle={1.5}
                      cornerRadius={4}
                      colors={{ datum: "data.color" }}
                      theme={nivoTheme}
                      borderWidth={0}
                      enableArcLinkLabels={false}
                      arcLabelsSkipAngle={16}
                    />
                  </Box>
                  <Stack direction="row" flexWrap="wrap" useFlexGap spacing={1.5} justifyContent="center" sx={{ mt: 1 }}>
                    {verdictPie.map((s) => (
                      <Stack key={s.id} direction="row" spacing={0.5} alignItems="center">
                        <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: s.color }} />
                        <Typography variant="caption" color="text.secondary">
                          {s.label} ({s.value})
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              </Box>
            )}
          </SectionCard>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 3 }}>
            <SectionCard title="Languages Used">
              {loading ? (
                <Stack spacing={1.5}>
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} height={28} />
                  ))}
                </Stack>
              ) : languages.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                  No submissions yet
                </Typography>
              ) : (
                <Stack spacing={2}>
                  {languages.map((l) => {
                    const pct = Math.round((Number(l.count) / totalLangSubs) * 100);
                    return (
                      <ProgressRow key={l.language} label={l.language} detail={`${l.count} subs · ${pct}%`} pct={pct} color="primary" />
                    );
                  })}
                </Stack>
              )}
            </SectionCard>

            <SectionCard title="Topic Mastery">
              {loading ? (
                <Stack spacing={1.5}>
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} height={28} />
                  ))}
                </Stack>
              ) : topTopics.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                  No topics solved yet
                </Typography>
              ) : (
                <Stack spacing={2}>
                  {topTopics.map((t) => (
                    <ProgressRow
                      key={t.topic}
                      label={t.topic}
                      detail={`${t.mastery}%`}
                      pct={t.mastery}
                      color={t.mastery >= 80 ? "success" : t.mastery >= 40 ? "primary" : "warning"}
                    />
                  ))}
                </Stack>
              )}
            </SectionCard>
          </Box>

          {skills && (skills.strengths.length > 0 || skills.weaknesses.length > 0) && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
              <SectionCard title="Strengths" icon={<TrendingUpIcon sx={{ fontSize: 20, color: "success.main" }} />}>
                {skills.strengths.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                    Not enough attempts yet to identify strengths.
                  </Typography>
                ) : (
                  <Stack spacing={2}>
                    {skills.strengths.map((s) => (
                      <ProgressRow key={s.topic} label={s.topic} detail={s.reason} pct={s.acRate} color="success" />
                    ))}
                  </Stack>
                )}
              </SectionCard>
              <SectionCard title="Weaknesses" icon={<TrendingDownIcon sx={{ fontSize: 20, color: "warning.main" }} />}>
                {skills.weaknesses.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                    Not enough attempts yet to identify weak spots.
                  </Typography>
                ) : (
                  <Stack spacing={2}>
                    {skills.weaknesses.map((s) => (
                      <ProgressRow key={s.topic} label={s.topic} detail={s.reason} pct={s.acRate} color="warning" />
                    ))}
                  </Stack>
                )}
              </SectionCard>
            </Box>
          )}

          {skills && skills.difficultyProgression.length > 0 && (
            <SectionCard title="Difficulty Progression" icon={<LayersOutlinedIcon sx={{ fontSize: 20, color: "text.secondary" }} />}>
              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                {skills.difficultyProgression.map((d) => (
                  <Chip
                    key={d.difficulty}
                    label={`${d.difficulty}: ${d.solved} solved`}
                    variant="outlined"
                    sx={{ borderColor: "outlineVariant" }}
                  />
                ))}
              </Stack>
            </SectionCard>
          )}

          {badges.length > 0 && (
            <SectionCard
              title="Badges"
              icon={<EmojiEventsOutlinedIcon sx={{ color: "warning.main", fontSize: 20 }} />}
              action={
                <Typography variant="caption" color="text.secondary">
                  {earnedBadges}/{badges.length} earned
                </Typography>
              }
            >
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)", lg: "repeat(5, 1fr)" }, gap: 1.5 }}>
                {badges.map((b) => (
                  <Tooltip key={b.key} title={b.earned ? b.desc : `${b.desc} — ${b.cur}/${b.target}`} arrow>
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        textAlign: "center",
                        p: 1.5,
                        borderRadius: 2,
                        border: "1px solid",
                        borderColor: b.earned ? "warning.main" : "outlineVariant",
                        bgcolor: b.earned ? "warningContainer" : "transparent",
                        opacity: b.earned ? 1 : 0.6,
                      }}
                    >
                      <Box sx={{ fontSize: 26, mb: 0.5, filter: b.earned ? "none" : "grayscale(1)" }} aria-hidden>
                        {b.icon}
                      </Box>
                      <Typography variant="caption" fontWeight={600} sx={{ lineHeight: 1.2 }}>
                        {b.label}
                      </Typography>
                      {!b.earned && (
                        <LinearProgress
                          variant="determinate"
                          value={b.progress}
                          color="warning"
                          sx={{ width: "100%", height: 4, borderRadius: 2, mt: 1 }}
                        />
                      )}
                    </Box>
                  </Tooltip>
                ))}
              </Box>
            </SectionCard>
          )}

          <SectionCard
            title="Contest Rating"
            icon={<EmojiEventsOutlinedIcon sx={{ color: "info.main", fontSize: 20 }} />}
            action={<RatingBadge rating={stats.rating} />}
          >
            {ratingHistory.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                No rated contests yet. Compete in a contest to earn a rating.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {ratingHistory
                  .slice()
                  .reverse()
                  .map((h) => (
                    <Stack
                      key={h.id}
                      direction="row"
                      spacing={2}
                      alignItems="center"
                      sx={{ py: 1, px: 1.5, borderRadius: 2, border: "1px solid", borderColor: "outlineVariant" }}
                    >
                      <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                        {h.contest_title || "Contest"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Rank #{h.rank}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "ui-monospace, monospace" }}>
                        {h.old_rating}→{h.new_rating}
                      </Typography>
                      <Typography
                        variant="caption"
                        fontWeight={700}
                        sx={{ fontFamily: "ui-monospace, monospace", width: 48, textAlign: "right", color: h.delta >= 0 ? "success.main" : "error.main" }}
                      >
                        {h.delta >= 0 ? "+" : ""}
                        {h.delta}
                      </Typography>
                    </Stack>
                  ))}
              </Stack>
            )}
          </SectionCard>
        </Stack>
      )}

      {/* ── Submissions ── */}
      {tab === "submissions" && <ProfileSubmissions />}

      {/* ── Coding Profiles ── */}
      {tab === "coding-profiles" && <ProfileCodingProfiles />}

      {/* ── Account ── */}
      {tab === "account" && (
        <Stack spacing={3}>
          <SectionCard title="Change Password" icon={<LockOutlinedIcon sx={{ color: "text.secondary", fontSize: 20 }} />}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
              <TextField
                type="password"
                label="Current Password"
                size="small"
                value={pwForm.current}
                onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))}
                autoComplete="current-password"
              />
              <TextField
                type="password"
                label="New Password"
                size="small"
                value={pwForm.next}
                onChange={(e) => setPwForm((p) => ({ ...p, next: e.target.value }))}
                helperText="Min 6 characters"
                autoComplete="new-password"
              />
              <TextField
                type="password"
                label="Confirm New"
                size="small"
                value={pwForm.confirm}
                onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))}
                autoComplete="new-password"
              />
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

          <SectionCard title="Two-Factor Authentication" icon={<LockOutlinedIcon sx={{ color: "text.secondary", fontSize: 20 }} />}>
            <Divider sx={{ mb: 2, borderColor: "outlineVariant" }} />
            <TwoFactorSetup />
          </SectionCard>
        </Stack>
      )}
    </Box>
  );
}

export default function ProfilePage() {
  return (
    <React.Suspense fallback={null}>
      <ProfileInner />
    </React.Suspense>
  );
}
