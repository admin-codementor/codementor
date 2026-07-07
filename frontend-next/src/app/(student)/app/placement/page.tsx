"use client";

import * as React from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardActionArea from "@mui/material/CardActionArea";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import LinearProgress from "@mui/material/LinearProgress";
import CircularProgress from "@mui/material/CircularProgress";
import Skeleton from "@mui/material/Skeleton";
import { TrackChangesOutlinedIcon, BusinessOutlinedIcon, AutoAwesomeOutlinedIcon, CheckCircleIcon, ArrowForwardIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { DifficultyChip } from "@/components/ui/DifficultyChip";
import { EmptyState } from "@/components/ui/States";
import { interactiveSurfaceSx } from "@/components/ui/interactive";
import { Reveal } from "@/components/ui/motion";

interface TrackTopic {
  topic: string;
  label: string;
  target: number;
  solved: number;
  pct: number;
}
interface TrackGap {
  label: string;
  need: number;
}
interface Track {
  key: string;
  label: string;
  color: string;
  companies: string[];
  focus: string;
  readiness: number;
  topics: TrackTopic[];
  gaps: TrackGap[];
}
interface RecProblem {
  id: string;
  title: string;
  difficulty: string;
  tags: string[];
}

// ── Readiness ring ────────────────────────────────────────────────────────────

function ReadinessRing({ pct, color }: { pct: number; color: string }) {
  return (
    <Box sx={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <CircularProgress
        variant="determinate"
        value={100}
        size={64}
        thickness={5}
        sx={{ color: "surfaceContainerHighest" }}
      />
      <CircularProgress
        variant="determinate"
        value={Math.min(100, pct)}
        size={64}
        thickness={5}
        sx={{ color, position: "absolute", left: 0, "& .MuiCircularProgress-circle": { strokeLinecap: "round" } }}
      />
      <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <Typography variant="subtitle1" fontWeight={700}>
          {pct}%
        </Typography>
      </Box>
    </Box>
  );
}

export default function PlacementPage() {
  const [tracks, setTracks] = React.useState<Track[]>([]);
  const [recommended, setRecommended] = React.useState<RecProblem[]>([]);
  const [selected, setSelected] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    api
      .get("/api/student/placement")
      .then((r) => {
        if (r.data?.success) {
          const t: Track[] = r.data.data.tracks || [];
          setTracks(t);
          setRecommended(r.data.data.recommended || []);
          if (t.length) setSelected(t[0].key);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const track = tracks.find((t) => t.key === selected);

  return (
    <Box>
      <PageHeader
        title="Placement Track"
        subtitle="Your readiness is computed from the problems you've actually solved, mapped to each recruitment track."
      />

      {loading ? (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", xl: "repeat(4, 1fr)" }, gap: 2 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} variant="outlined" sx={{ p: 2.5, borderColor: "outlineVariant" }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Skeleton variant="circular" width={64} height={64} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton width="70%" />
                  <Skeleton width="50%" />
                </Box>
              </Stack>
            </Card>
          ))}
        </Box>
      ) : tracks.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState icon={<TrackChangesOutlinedIcon />} title="No track data available" />
        </Card>
      ) : (
        <Stack spacing={3}>
          {/* Track readiness cards */}
          <Reveal>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", xl: "repeat(4, 1fr)" }, gap: 2 }}>
            {tracks.map((t) => {
              const active = selected === t.key;
              return (
                <Card
                  key={t.key}
                  variant="outlined"
                  sx={{
                    borderColor: active ? "primary.main" : "outlineVariant",
                    bgcolor: active ? "primaryContainer" : undefined,
                    ...interactiveSurfaceSx,
                    ...(active ? { "&:hover": { borderColor: "primary.main", transform: "translateY(-2px)", boxShadow: 3 } } : {}),
                  }}
                >
                  <CardActionArea onClick={() => setSelected(t.key)} aria-pressed={active} sx={{ p: 2, borderRadius: "inherit" }}>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1.5 }}>
                      <ReadinessRing pct={t.readiness} color={t.color} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2" fontWeight={600}>
                          {t.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t.focus}
                        </Typography>
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {t.companies.slice(0, 4).map((co) => (
                        <Chip key={co} label={co} size="small" sx={{ height: 20, fontSize: 10, bgcolor: "surfaceContainerHigh", color: "onSurfaceVariant" }} />
                      ))}
                    </Stack>
                  </CardActionArea>
                </Card>
              );
            })}
          </Box>
          </Reveal>

          {/* Selected track breakdown */}
          {track && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "2fr 1fr" }, gap: 3 }}>
              <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                    <TrackChangesOutlinedIcon sx={{ color: track.color, fontSize: 20 }} />
                    <Typography variant="subtitle2" fontWeight={600}>
                      {track.label} — Topic Coverage
                    </Typography>
                  </Stack>
                  <Stack spacing={2}>
                    {track.topics.map((tp) => (
                      <Box key={tp.topic}>
                        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                          <Typography variant="body2" fontWeight={500} sx={{ textTransform: "capitalize" }}>
                            {tp.label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "ui-monospace, monospace" }}>
                            {tp.solved}/{tp.target}
                          </Typography>
                        </Stack>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(100, tp.pct)}
                          sx={{
                            height: 8,
                            borderRadius: 4,
                            "& .MuiLinearProgress-bar": { bgcolor: tp.pct >= 100 ? "success.main" : track.color },
                          }}
                        />
                      </Box>
                    ))}
                  </Stack>
                </CardContent>
              </Card>

              <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                    <BusinessOutlinedIcon sx={{ color: "warning.main", fontSize: 20 }} />
                    <Typography variant="subtitle2" fontWeight={600}>
                      What&apos;s Missing
                    </Typography>
                  </Stack>
                  {track.gaps.length === 0 ? (
                    <Stack alignItems="center" spacing={1} sx={{ py: 3, color: "success.main" }}>
                      <CheckCircleIcon sx={{ fontSize: 32 }} />
                      <Typography variant="body2" fontWeight={600}>
                        You&apos;re track-ready!
                      </Typography>
                    </Stack>
                  ) : (
                    <Stack spacing={1}>
                      {track.gaps.map((g) => (
                        <Stack
                          key={g.label}
                          direction="row"
                          justifyContent="space-between"
                          alignItems="center"
                          sx={{ px: 1.5, py: 1, borderRadius: 2, border: "1px solid", borderColor: "outlineVariant" }}
                        >
                          <Typography variant="body2" sx={{ textTransform: "capitalize" }}>
                            {g.label}
                          </Typography>
                          <Typography variant="caption" fontWeight={600} color="warning.main">
                            +{g.need} to go
                          </Typography>
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </CardContent>
              </Card>
            </Box>
          )}

          {/* Recommended next problems */}
          {recommended.length > 0 && (
            <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <AutoAwesomeOutlinedIcon sx={{ color: "info.main", fontSize: 20 }} />
                  <Typography variant="subtitle2" fontWeight={600}>
                    Recommended next — close your biggest gaps
                  </Typography>
                </Stack>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1 }}>
                  {recommended.map((p) => (
                    <Stack
                      key={p.id}
                      component={NextLink}
                      href={`/app/problems/${p.id}`}
                      direction="row"
                      spacing={1.5}
                      alignItems="center"
                      sx={{
                        textDecoration: "none",
                        color: "inherit",
                        px: 1.5,
                        py: 1.25,
                        borderRadius: 2,
                        border: "1px solid",
                        borderColor: "outlineVariant",
                        "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
                      }}
                    >
                      <Link component="span" color="text.primary" sx={{ flex: 1, minWidth: 0, fontWeight: 500 }} noWrap>
                        {p.title}
                      </Link>
                      <DifficultyChip difficulty={p.difficulty} />
                      <ArrowForwardIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                    </Stack>
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}
        </Stack>
      )}
    </Box>
  );
}
