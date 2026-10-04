"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Avatar from "@mui/material/Avatar";
import MuiLink from "@mui/material/Link";
import LinearProgress from "@mui/material/LinearProgress";
import { GppGoodOutlinedIcon, WaypointsIcon, LinkOutlinedIcon, SchoolOutlinedIcon } from "@/components/ui/icons";
import { DataState } from "@/components/ui/DataState";
import { ListSkeleton } from "@/components/ui/Skeletons";
import { TagChip } from "@/components/ui/TagChip";
import { radius, layout } from "@/theme/tokens";
import { usePublicProfileQuery, type PublicProfile } from "@/lib/queries/jobReady";

/**
 * A student's public profile — the link they put on a resume.
 *
 * Outside the app shell on purpose: the visitor is a recruiter who has no
 * account here, and showing them a navigation sidebar for a product they do not
 * use would be noise. Every number on this page was produced by our own judge
 * or proved by the student; nothing here is self-reported, which is the only
 * reason the page is worth anything to the person reading it.
 */

const PLATFORM_LABEL: Record<string, string> = {
  codeforces: "Codeforces",
  leetcode: "LeetCode",
  codechef: "CodeChef",
  hackerrank: "HackerRank",
  gfg: "GeeksforGeeks",
};

const PLATFORM_URL: Record<string, (handle: string) => string> = {
  codeforces: (h) => `https://codeforces.com/profile/${encodeURIComponent(h)}`,
  leetcode: (h) => `https://leetcode.com/u/${encodeURIComponent(h)}/`,
};

function initialsOf(name: string | null) {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

/** A year of solve activity. Weeks run down each column, as a calendar would. */
function ActivityGrid({ activity }: { activity: { date: string; count: number }[] }) {
  const byDate = new Map(activity.map((a) => [a.date, a.count]));
  // Anchored to a value fixed at mount: recomputing "today" during a render
  // would make the grid shift under a long-lived tab.
  const [end] = React.useState(() => new Date());

  const days: { date: string; count: number }[] = [];
  for (let i = 364; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: byDate.get(key) ?? 0 });
  }

  const shade = (count: number) => {
    if (count === 0) return "var(--mui-palette-outlineVariant)";
    const steps = [25, 45, 70, 100];
    const pct = steps[Math.min(count, steps.length) - 1];
    return `color-mix(in srgb, var(--mui-palette-primary-main) ${pct}%, transparent)`;
  };

  // Scrolled to the recent end on arrival. Left alone it opens on a year ago,
  // which for anyone glancing at the page is the least interesting part of it.
  const scroller = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  return (
    <Box ref={scroller} sx={{ overflowX: "auto", pb: 1 }}>
      <Box
        role="img"
        aria-label={`Solving activity over the last year: ${activity.reduce((n, a) => n + a.count, 0)} problems`}
        sx={{
          display: "grid",
          gridTemplateRows: "repeat(7, 10px)",
          gridAutoFlow: "column",
          gridAutoColumns: "10px",
          gap: "3px",
          minWidth: "max-content",
        }}
      >
        {days.map((d) => (
          <Box
            key={d.date}
            title={`${d.date}: ${d.count} solved`}
            sx={{ width: 10, height: 10, borderRadius: radius.xs, backgroundColor: shade(d.count) }}
          />
        ))}
      </Box>
    </Box>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

function ProfileBody({ profile }: { profile: PublicProfile }) {
  const { verified } = profile;
  const subtitle = [profile.department, profile.year ? `Year ${profile.year}` : null].filter(Boolean).join(" · ");

  return (
    <Stack spacing={layout.sectionGap}>
      {/* Identity */}
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: layout.cardPadding }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2.5} alignItems={{ xs: "flex-start", sm: "center" }}>
          <Avatar sx={{ width: 64, height: 64, bgcolor: "primaryContainer", color: "onPrimaryContainer", typography: "h4", fontWeight: 700 }}>
            {initialsOf(profile.name)}
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h5" fontWeight={700}>
              {profile.name ?? profile.handle}
            </Typography>
            {profile.college && (
              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.25 }}>
                <SchoolOutlinedIcon fontSize="small" sx={{ color: "text.secondary" }} />
                <Typography variant="body2" color="text.secondary">
                  {profile.college}{subtitle ? ` · ${subtitle}` : ""}
                </Typography>
              </Stack>
            )}
          </Box>
          <Chip
            icon={<GppGoodOutlinedIcon />}
            label="Verified by CodeMentor"
            color="success"
            variant="outlined"
            size="small"
          />
        </Stack>
      </Card>

      {/* Judged work */}
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: layout.cardPadding }}>
        <Typography variant="subtitle1" fontWeight={700}>
          Problems solved
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Every one of these was run against hidden tests on this platform.
        </Typography>

        <Stack direction="row" spacing={4} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
          <Stat label="Total solved" value={verified.solved} />
          <Stat label="Easy" value={verified.byDifficulty.easy} />
          <Stat label="Medium" value={verified.byDifficulty.medium} />
          <Stat label="Hard" value={verified.byDifficulty.hard} />
        </Stack>

        {verified.topTopics.length > 0 && (
          <Box sx={{ mt: 2.5 }}>
            <Typography variant="overline" color="text.secondary">
              Strongest topics
            </Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
              {verified.topTopics.map((t) => (
                <Chip key={t.topic} size="small" variant="outlined" label={`${t.topic} · ${t.count}`} />
              ))}
            </Stack>
          </Box>
        )}

        {verified.activity.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 1 }}>
              Last year
            </Typography>
            <ActivityGrid activity={verified.activity} />
          </Box>
        )}
      </Card>

      {/* Score, if the student chose to show it */}
      {profile.jobReady && profile.jobReady.length > 0 && (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: layout.cardPadding }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Job-Ready Score
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Computed from solved problems, test scores and consistency — not self-reported.
          </Typography>
          <Stack spacing={1.5} sx={{ mt: 2 }}>
            {profile.jobReady.map((t) => (
              <Box key={t.key}>
                <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                  <Typography variant="body2">{t.label}</Typography>
                  <Typography variant="body2" fontWeight={700}>{t.score}</Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={t.score}
                  sx={{ height: 6, borderRadius: radius.full, mt: 0.5 }}
                />
              </Box>
            ))}
          </Stack>
        </Card>
      )}

      {/* Roadmap */}
      {profile.roadmap && (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: layout.cardPadding }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <WaypointsIcon />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                Following the {profile.roadmap.role} roadmap
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {profile.roadmap.step
                  ? `Step ${profile.roadmap.step} of ${profile.roadmap.steps} · ${profile.roadmap.percent}%`
                  : `All ${profile.roadmap.steps} steps complete`}
              </Typography>
            </Box>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={profile.roadmap.percent}
            sx={{ height: 6, borderRadius: radius.full, mt: 1.5 }}
          />
        </Card>
      )}

      {/* Courses */}
      {profile.completedCourses.length > 0 && (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: layout.cardPadding }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Courses completed
          </Typography>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
            {profile.completedCourses.map((c) => (
              <TagChip key={c.title} tag={`${c.title} (${c.problems})`} />
            ))}
          </Stack>
        </Card>
      )}

      {/* External accounts, verified only */}
      {profile.externals.length > 0 && (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: layout.cardPadding }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Verified elsewhere
          </Typography>
          <Typography variant="caption" color="text.secondary">
            These accounts were proved to belong to this student by a one-time code on the profile.
          </Typography>
          <Stack spacing={1} sx={{ mt: 1.5 }}>
            {profile.externals.map((e) => {
              const url = PLATFORM_URL[e.platform]?.(e.handle);
              return (
                <Stack key={e.platform} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <GppGoodOutlinedIcon fontSize="small" sx={{ color: "success.main" }} />
                  <Typography variant="body2" fontWeight={600}>
                    {PLATFORM_LABEL[e.platform] ?? e.platform}
                  </Typography>
                  {url ? (
                    <MuiLink href={url} target="_blank" rel="noopener noreferrer nofollow" variant="body2">
                      {e.handle}
                    </MuiLink>
                  ) : (
                    <Typography variant="body2" color="text.secondary">{e.handle}</Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {e.solved} solved{e.rating ? ` · rating ${e.rating}` : ""}
                  </Typography>
                </Stack>
              );
            })}
          </Stack>
        </Card>
      )}

      <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center" sx={{ pt: 1 }}>
        <LinkOutlinedIcon fontSize="small" sx={{ color: "text.secondary" }} />
        <Typography variant="caption" color="text.secondary">
          codementor.app/u/{profile.handle}
        </Typography>
      </Stack>
    </Stack>
  );
}

export default function PublicProfilePage() {
  const params = useParams<{ handle: string }>();
  const handle = params?.handle ?? "";
  const query = usePublicProfileQuery(handle);

  return (
    <Box sx={{ maxWidth: 820, mx: "auto", px: layout.pageGutter, py: { xs: 3, sm: 5 } }}>
      <DataState
        loading={query.isLoading}
        error={query.isError ? query.error : undefined}
        onRetry={query.refetch}
        skeleton={<ListSkeleton rows={5} showAvatar />}
      >
        {query.data && <ProfileBody profile={query.data} />}
      </DataState>
    </Box>
  );
}
