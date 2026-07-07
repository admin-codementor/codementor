"use client";

import * as React from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Drawer from "@mui/material/Drawer";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Badge from "@mui/material/Badge";
import CircularProgress from "@mui/material/CircularProgress";
import Skeleton from "@mui/material/Skeleton";
import Alert from "@mui/material/Alert";
import TextField from "@mui/material/TextField";
import Divider from "@mui/material/Divider";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { CloseIcon, AccessTimeIcon, EmojiEventsOutlinedIcon, GroupsOutlinedIcon, VisibilityOutlinedIcon, VisibilityOffOutlinedIcon, AcUnitIcon, CheckCircleIcon, PlayArrowIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { EmptyState } from "@/components/ui/States";
import { interactiveSurfaceSx } from "@/components/ui/interactive";
import { Reveal } from "@/components/ui/motion";
import api from "@/lib/api";
import { getUser } from "@/lib/auth";
import { createSocket, joinRoom, leaveRoom } from "@/lib/socket";

interface Contest {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  scoreboard_mode: "public" | "frozen" | "hidden";
  freeze_at: string | null;
  host_name: string;
  problem_count: number;
  registrant_count: number;
}
interface ScoreboardRow {
  user_id: string;
  name: string;
  email: string;
  solved: number;
  penalty: number;
  problems: Record<string, { accepted: boolean; attempts: number; penalty: number }>;
  is_frozen_row: boolean;
}
type ContestStatus = "upcoming" | "active" | "past";
type DetailTab = "info" | "scoreboard" | "virtual";

interface ContestProblem {
  id: string;
  title: string;
  difficulty: string;
}
interface ContestDetail {
  problems?: ContestProblem[];
}
interface ScoreboardMeta {
  problem_ids?: string[];
  frozen?: boolean;
  hidden?: boolean;
}
interface VirtualData {
  started_at: string;
  solved: number;
  penalty: number;
  problem_ids?: string[];
  problems?: Record<string, { accepted: boolean; attempts: number; elapsed: number }>;
}

function contestStatus(c: Contest): ContestStatus {
  const now = Date.now();
  const start = new Date(c.starts_at).getTime();
  const end = new Date(c.ends_at).getTime();
  if (now < start) return "upcoming";
  if (now <= end) return "active";
  return "past";
}

function fmt(d: string) {
  return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function timeLabel(c: Contest) {
  const status = contestStatus(c);
  if (status === "upcoming") return `Starts ${fmt(c.starts_at)}`;
  if (status === "active") return `Ends ${fmt(c.ends_at)}`;
  return `Ended ${fmt(c.ends_at)}`;
}

function ScoreboardModeIcon({ mode }: { mode: string }) {
  if (mode === "hidden") return <VisibilityOffOutlinedIcon sx={{ fontSize: 15, color: "error.main" }} />;
  if (mode === "frozen") return <AcUnitIcon sx={{ fontSize: 15, color: "info.main" }} />;
  return <VisibilityOutlinedIcon sx={{ fontSize: 15, color: "success.main" }} />;
}

const STATUS_TONE: Record<ContestStatus, { bg: string; fg: string }> = {
  upcoming: { bg: "warningContainer", fg: "onWarningContainer" },
  active: { bg: "successContainer", fg: "onSuccessContainer" },
  past: { bg: "surfaceContainerHigh", fg: "onSurfaceVariant" },
};

// ── Contest card ──────────────────────────────────────────────────────────────

function ContestCard({ contest, onClick }: { contest: Contest; onClick: () => void }) {
  const status = contestStatus(contest);
  return (
    <Card variant="outlined" sx={{ borderColor: "outlineVariant", ...interactiveSurfaceSx }}>
      <CardActionArea onClick={onClick} sx={{ p: 2.5, borderRadius: "inherit" }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1.5} sx={{ mb: 1.5 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={600} noWrap>
              {contest.title}
            </Typography>
            {contest.description && (
              <Typography variant="body2" color="text.secondary" noWrap>
                {contest.description}
              </Typography>
            )}
          </Box>
          <Chip label={status} size="small" sx={{ flexShrink: 0, textTransform: "capitalize", bgcolor: STATUS_TONE[status].bg, color: STATUS_TONE[status].fg }} />
        </Stack>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap sx={{ color: "text.secondary" }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <AccessTimeIcon sx={{ fontSize: 15 }} />
            <Typography variant="caption">{timeLabel(contest)}</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <EmojiEventsOutlinedIcon sx={{ fontSize: 15 }} />
            <Typography variant="caption">{contest.problem_count} problems</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <GroupsOutlinedIcon sx={{ fontSize: 15 }} />
            <Typography variant="caption">{contest.registrant_count}</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: "auto" }}>
            <ScoreboardModeIcon mode={contest.scoreboard_mode} />
            <Typography variant="caption">{contest.scoreboard_mode}</Typography>
          </Stack>
        </Stack>
      </CardActionArea>
    </Card>
  );
}

// ── Scoreboard panel (live) ─────────────────────────────────────────────────────

function ScoreboardPanel({ contestId, problemIds, frozen, hidden }: { contestId: string; problemIds: string[]; frozen: boolean; hidden: boolean }) {
  const [rows, setRows] = React.useState<ScoreboardRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [live, setLive] = React.useState(false);

  const load = React.useCallback(
    (showSpinner = true) => {
      if (showSpinner) setLoading(true);
      api
        .get(`/api/contests/${contestId}/scoreboard`)
        .then((r) => {
          if (r.data.success) setRows(r.data.data);
          else setError(r.data.error);
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    },
    [contestId],
  );

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    const socket = createSocket();
    socket.on("connect", () => {
      joinRoom(socket, `contest:${contestId}`);
      setLive(true);
    });
    socket.on("disconnect", () => setLive(false));
    socket.on("scoreboard_update", () => load(false));
    return () => {
      leaveRoom(socket, `contest:${contestId}`);
      socket.disconnect();
    };
  }, [contestId, load]);

  if (hidden) {
    return <EmptyState icon={<VisibilityOffOutlinedIcon />} title="Scoreboard is hidden during this contest." />;
  }
  if (loading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error) {
    return (
      <Alert severity="error" sx={{ my: 1 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box>
      {live && !frozen && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, color: "success.main" }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: "success.main",
              animation: "pulse 1.5s ease-in-out infinite",
              "@keyframes pulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.3 } },
            }}
          />
          <Typography variant="caption" fontWeight={600}>
            Live — updates automatically
          </Typography>
        </Stack>
      )}
      {frozen && (
        <Alert severity="info" icon={<AcUnitIcon />} sx={{ mb: 2 }}>
          Scoreboard is frozen — standings after the freeze time are not shown.
        </Alert>
      )}
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 4 }}>
          No submissions yet.
        </Typography>
      ) : (
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" aria-label="Contest scoreboard">
            <TableHead>
              <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600, borderColor: "outlineVariant" } }}>
                <TableCell sx={{ width: 32 }}>#</TableCell>
                <TableCell>Name</TableCell>
                <TableCell align="center">Solved</TableCell>
                <TableCell align="center">Penalty</TableCell>
                {problemIds.map((_, i) => (
                  <TableCell key={i} align="center">
                    {String.fromCharCode(65 + i)}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow key={row.user_id} sx={{ opacity: row.is_frozen_row ? 0.6 : 1, "& td": { borderColor: "outlineVariant" } }}>
                  <TableCell sx={{ fontFamily: "ui-monospace, monospace", color: "text.secondary" }}>{idx + 1}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {row.is_frozen_row && <AcUnitIcon sx={{ fontSize: 13, color: "info.main" }} />}
                      <Typography variant="body2" fontWeight={500} noWrap sx={{ maxWidth: 140 }}>
                        {row.name}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, color: "success.main" }}>{row.solved}</TableCell>
                  <TableCell align="center" sx={{ fontFamily: "ui-monospace, monospace", color: "text.secondary" }}>{row.penalty}</TableCell>
                  {problemIds.map((pid) => {
                    const p = row.problems[pid];
                    return (
                      <TableCell key={pid} align="center" sx={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                        {p?.accepted ? (
                          <Box component="span" sx={{ color: "success.main" }}>+{p.attempts > 1 ? p.attempts - 1 : ""}</Box>
                        ) : p?.attempts ? (
                          <Box component="span" sx={{ color: "error.main" }}>-{p.attempts}</Box>
                        ) : (
                          <Box component="span" sx={{ color: "outline" }}>·</Box>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContestsPage() {
  const [contests, setContests] = React.useState<Contest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [listTab, setListTab] = React.useState<ContestStatus>("active");

  const [selected, setSelected] = React.useState<Contest | null>(null);
  const [detail, setDetail] = React.useState<ContestDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [tab, setTab] = React.useState<DetailTab>("info");
  const [registering, setRegistering] = React.useState(false);
  const [registered, setRegistered] = React.useState(false);
  const [sbData, setSbData] = React.useState<ScoreboardMeta | null>(null);
  const [startingVirtual, setStartingVirtual] = React.useState(false);
  const [virtualData, setVirtualData] = React.useState<VirtualData | null>(null);

  // Faculty/admin scoreboard control
  const [isFaculty, setIsFaculty] = React.useState(false);
  const [sbMode, setSbMode] = React.useState<"public" | "frozen" | "hidden">("public");
  const [sbFreezeAt, setSbFreezeAt] = React.useState("");
  const [savingMode, setSavingMode] = React.useState(false);
  const [finalizing, setFinalizing] = React.useState(false);
  const [finalizeMsg, setFinalizeMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    const u = getUser();
    setIsFaculty(u?.role === "faculty" || u?.role === "admin");
    api
      .get("/api/contests")
      .then((r) => {
        if (r.data.success) setContests(r.data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openContest = React.useCallback(async (c: Contest) => {
    setSelected(c);
    setDetail(null);
    setTab("info");
    setSbData(null);
    setRegistered(false);
    setVirtualData(null);
    setSbMode(c.scoreboard_mode);
    setSbFreezeAt(c.freeze_at ? new Date(c.freeze_at).toISOString().slice(0, 16) : "");
    setFinalizeMsg(null);
    setDetailLoading(true);
    try {
      const [detRes, sbRes] = await Promise.allSettled([
        api.get(`/api/contests/${c.id}`),
        api.get(`/api/contests/${c.id}/scoreboard`),
      ]);
      if (detRes.status === "fulfilled" && detRes.value.data.success) setDetail(detRes.value.data.data);
      if (sbRes.status === "fulfilled" && sbRes.value.data.success) setSbData(sbRes.value.data);
    } catch {
      /* ignore */
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleRegister = async () => {
    if (!selected) return;
    setRegistering(true);
    try {
      await api.post(`/api/contests/${selected.id}/register`);
      setRegistered(true);
    } catch {
      /* ignore */
    } finally {
      setRegistering(false);
    }
  };

  const handleStartVirtual = async () => {
    if (!selected) return;
    setStartingVirtual(true);
    try {
      await api.post(`/api/contests/${selected.id}/virtual`);
      const res = await api.get(`/api/contests/${selected.id}/virtual/scoreboard`);
      if (res.data.success) {
        setVirtualData(res.data.data);
        setTab("virtual");
      }
    } catch {
      /* ignore */
    } finally {
      setStartingVirtual(false);
    }
  };

  const handleUpdateScoreboardMode = async () => {
    if (!selected) return;
    if (sbMode === "frozen" && !sbFreezeAt) return;
    setSavingMode(true);
    try {
      const freeze = sbMode === "frozen" ? sbFreezeAt : null;
      await api.patch(`/api/contests/${selected.id}/scoreboard-mode`, { scoreboard_mode: sbMode, freeze_at: freeze });
      const patched = { scoreboard_mode: sbMode, freeze_at: freeze } as Partial<Contest>;
      setSelected((s) => (s ? { ...s, ...patched } : s));
      setContests((prev) => prev.map((c) => (c.id === selected.id ? { ...c, ...patched } : c)));
      const res = await api.get(`/api/contests/${selected.id}/scoreboard`);
      if (res.data.success) setSbData(res.data);
    } catch {
      /* ignore */
    } finally {
      setSavingMode(false);
    }
  };

  const handleFinalizeRatings = async () => {
    if (!selected) return;
    setFinalizing(true);
    setFinalizeMsg(null);
    try {
      const res = await api.post(`/api/rating/contest/${selected.id}/recompute`);
      const n = res.data?.data?.participants ?? 0;
      setFinalizeMsg(`✓ Ratings finalized for ${n} participant${n === 1 ? "" : "s"}.`);
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setFinalizeMsg(err?.response?.data?.error || "Failed to finalize ratings.");
    } finally {
      setFinalizing(false);
    }
  };

  const filterTab = (t: ContestStatus) => contests.filter((c) => contestStatus(c) === t);
  const activeCount = filterTab("active").length;
  const list = filterTab(listTab);
  const selectedStatus = selected ? contestStatus(selected) : "upcoming";
  const problemIds = detail?.problems?.map((p) => p.id) ?? sbData?.problem_ids ?? [];

  return (
    <Box>
      <PageHeader
        title="Contests"
        subtitle="Compete in timed rounds, climb the live scoreboard, and earn contest rating."
      />
      <Tabs
        value={listTab}
        onChange={(_, v: ContestStatus) => setListTab(v)}
        sx={{ mb: 3, borderBottom: "1px solid", borderColor: "outlineVariant" }}
      >
        <Tab
          value="active"
          label={
            activeCount > 0 ? (
              <Badge color="success" badgeContent={activeCount} sx={{ "& .MuiBadge-badge": { right: -12 } }}>
                Live
              </Badge>
            ) : (
              "Live"
            )
          }
        />
        <Tab value="upcoming" label="Upcoming" />
        <Tab value="past" label="Past" />
      </Tabs>

      {loading ? (
        <Stack spacing={1.5}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} variant="outlined" sx={{ p: 2.5, borderColor: "outlineVariant" }}>
              <Skeleton width="45%" height={26} />
              <Skeleton width="70%" />
              <Skeleton width="30%" sx={{ mt: 1.5 }} />
            </Card>
          ))}
        </Stack>
      ) : list.length === 0 ? (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
          <EmptyState icon={<EmojiEventsOutlinedIcon />} title={`No ${listTab} contests.`} />
        </Card>
      ) : (
        <Reveal>
          <Stack spacing={1.5}>
            {list.map((c) => (
              <ContestCard key={c.id} contest={c} onClick={() => openContest(c)} />
            ))}
          </Stack>
        </Reveal>
      )}

      {/* Detail drawer */}
      <Drawer
        anchor="right"
        open={selected != null}
        onClose={() => setSelected(null)}
        slotProps={{ paper: { sx: { width: { xs: "100%", sm: 560 }, maxWidth: "100%" } } }}
      >
        {selected && (
          <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Header */}
            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2} sx={{ px: 3, py: 2, borderBottom: "1px solid", borderColor: "outlineVariant" }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h6" fontWeight={600} noWrap>
                  {selected.title}
                </Typography>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 0.5, color: "text.secondary" }} flexWrap="wrap" useFlexGap>
                  <Typography variant="caption">{timeLabel(selected)}</Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <ScoreboardModeIcon mode={selected.scoreboard_mode} />
                    <Typography variant="caption">{selected.scoreboard_mode} scoreboard</Typography>
                  </Stack>
                </Stack>
              </Box>
              <IconButton onClick={() => setSelected(null)} aria-label="Close" edge="end">
                <CloseIcon />
              </IconButton>
            </Stack>

            {/* Tabs */}
            <Tabs value={tab} onChange={(_, v: DetailTab) => setTab(v)} sx={{ px: 1, borderBottom: "1px solid", borderColor: "outlineVariant" }}>
              <Tab value="info" label="Info" />
              <Tab value="scoreboard" label="Scoreboard" />
              {selectedStatus === "past" && <Tab value="virtual" label="Virtual" />}
            </Tabs>

            <Box sx={{ flex: 1, overflowY: "auto", p: 3 }}>
              {detailLoading ? (
                <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
                  <CircularProgress />
                </Box>
              ) : tab === "virtual" ? (
                <Stack spacing={2.5}>
                  <Alert severity="info" icon={<PlayArrowIcon />}>
                    <Typography variant="body2" fontWeight={600}>
                      Virtual Participation
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Solve this past contest as if it&apos;s live. Your submissions are tracked separately and won&apos;t affect the official scoreboard.
                    </Typography>
                  </Alert>
                  {virtualData ? (
                    <Stack spacing={2}>
                      <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography variant="body2" color="text.secondary">
                          Started <Box component="span" sx={{ color: "text.primary" }}>{new Date(virtualData.started_at).toLocaleString()}</Box>
                        </Typography>
                        <Typography variant="body2" fontWeight={700} color="success.main">
                          {virtualData.solved} solved
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Penalty <Box component="span" sx={{ fontFamily: "ui-monospace, monospace", color: "text.primary" }}>{virtualData.penalty}</Box>
                        </Typography>
                      </Stack>
                      <Stack spacing={0.5}>
                        {(virtualData.problem_ids || []).map((pid, i) => {
                          const p = virtualData.problems?.[pid];
                          return (
                            <Stack key={pid} direction="row" spacing={1.5} alignItems="center" sx={{ px: 1.5, py: 1, borderRadius: 2, border: "1px solid", borderColor: "outlineVariant" }}>
                              <Typography variant="caption" sx={{ fontFamily: "ui-monospace, monospace", color: "text.secondary", width: 20 }}>
                                {String.fromCharCode(65 + i)}
                              </Typography>
                              {p?.accepted ? (
                                <Typography variant="caption" sx={{ fontFamily: "ui-monospace, monospace", color: "success.main" }}>
                                  AC +{p.attempts > 1 ? p.attempts - 1 : "0"} | {p.elapsed}min
                                </Typography>
                              ) : p?.attempts ? (
                                <Typography variant="caption" sx={{ fontFamily: "ui-monospace, monospace", color: "error.main" }}>
                                  WA ×{p.attempts}
                                </Typography>
                              ) : (
                                <Typography variant="caption" color="text.secondary">
                                  Not attempted
                                </Typography>
                              )}
                            </Stack>
                          );
                        })}
                      </Stack>
                    </Stack>
                  ) : (
                    <Button variant="contained" fullWidth startIcon={<PlayArrowIcon />} onClick={handleStartVirtual} disabled={startingVirtual}>
                      {startingVirtual ? "Starting…" : "Start Virtual Participation"}
                    </Button>
                  )}
                </Stack>
              ) : tab === "info" ? (
                <Stack spacing={2.5}>
                  {selected.description && (
                    <Typography variant="body2" color="text.secondary">
                      {selected.description}
                    </Typography>
                  )}
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
                    <Card variant="outlined" sx={{ p: 1.5, borderColor: "outlineVariant" }}>
                      <Typography variant="caption" color="text.secondary">
                        Problems
                      </Typography>
                      <Typography variant="h6" fontWeight={700}>
                        {detail?.problems?.length ?? selected.problem_count}
                      </Typography>
                    </Card>
                    <Card variant="outlined" sx={{ p: 1.5, borderColor: "outlineVariant" }}>
                      <Typography variant="caption" color="text.secondary">
                        Registered
                      </Typography>
                      <Typography variant="h6" fontWeight={700}>
                        {selected.registrant_count}
                      </Typography>
                    </Card>
                  </Box>

                  {detail?.problems && detail.problems.length > 0 && (
                    <Box>
                      <Typography variant="overline" color="text.secondary">
                        Problems
                      </Typography>
                      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                        {detail.problems.map((p, i) => (
                          <Stack
                            key={p.id}
                            component={NextLink}
                            href={`/app/problems/${p.id}?contest=${selected.id}`}
                            direction="row"
                            spacing={1.5}
                            alignItems="center"
                            sx={{
                              textDecoration: "none",
                              color: "inherit",
                              px: 1.5,
                              py: 1,
                              borderRadius: 2,
                              border: "1px solid",
                              borderColor: "outlineVariant",
                              "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
                            }}
                          >
                            <Typography variant="caption" sx={{ fontFamily: "ui-monospace, monospace", color: "text.secondary", width: 20 }}>
                              {String.fromCharCode(65 + i)}
                            </Typography>
                            <Link component="span" color="text.primary" sx={{ flex: 1 }} noWrap>
                              {p.title}
                            </Link>
                            <Typography
                              variant="caption"
                              sx={{ textTransform: "capitalize", color: p.difficulty === "easy" ? "success.main" : p.difficulty === "medium" ? "warning.main" : "error.main" }}
                            >
                              {p.difficulty}
                            </Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </Box>
                  )}

                  {selectedStatus !== "past" && (
                    <Button
                      variant="contained"
                      fullWidth
                      onClick={handleRegister}
                      disabled={registering || registered}
                      startIcon={registered ? <CheckCircleIcon /> : undefined}
                    >
                      {registered ? "Registered!" : registering ? "Registering…" : "Register"}
                    </Button>
                  )}

                  {/* Faculty/admin scoreboard control */}
                  {isFaculty && (
                    <Card variant="outlined" sx={{ p: 2, borderColor: "outlineVariant" }}>
                      <Stack spacing={1.5}>
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "text.secondary" }}>
                          <VisibilityOutlinedIcon sx={{ fontSize: 15 }} />
                          <Typography variant="overline">Scoreboard Control</Typography>
                        </Stack>
                        <SegmentedButtons<"public" | "frozen" | "hidden">
                          value={sbMode}
                          onChange={setSbMode}
                          segments={[
                            { value: "public", label: "Public" },
                            { value: "frozen", label: "Frozen" },
                            { value: "hidden", label: "Hidden" },
                          ]}
                          ariaLabel="Scoreboard mode"
                        />
                        {sbMode === "frozen" && (
                          <TextField
                            type="datetime-local"
                            label="Freeze at"
                            size="small"
                            value={sbFreezeAt}
                            onChange={(e) => setSbFreezeAt(e.target.value)}
                            slotProps={{ inputLabel: { shrink: true } }}
                          />
                        )}
                        <Button
                          variant="outlined"
                          color="success"
                          onClick={handleUpdateScoreboardMode}
                          disabled={savingMode || (sbMode === "frozen" && !sbFreezeAt)}
                        >
                          {savingMode ? "Updating…" : "Update Scoreboard Mode"}
                        </Button>
                        <Typography variant="caption" color="text.secondary">
                          Only the contest host can change this. Frozen hides standings after the freeze time; hidden conceals the board entirely during the contest.
                        </Typography>

                        {selectedStatus === "past" && (
                          <>
                            <Divider sx={{ borderColor: "outlineVariant" }} />
                            <Button variant="outlined" color="info" startIcon={<EmojiEventsOutlinedIcon />} onClick={handleFinalizeRatings} disabled={finalizing}>
                              {finalizing ? "Finalizing…" : "Finalize Contest Ratings"}
                            </Button>
                            {finalizeMsg && (
                              <Typography variant="caption" color="text.secondary">
                                {finalizeMsg}
                              </Typography>
                            )}
                            <Typography variant="caption" color="text.secondary">
                              Applies Elo updates from final standings. Can only be run once per contest.
                            </Typography>
                          </>
                        )}
                      </Stack>
                    </Card>
                  )}
                </Stack>
              ) : (
                <ScoreboardPanel
                  contestId={selected.id}
                  problemIds={problemIds}
                  frozen={sbData?.frozen ?? false}
                  hidden={sbData?.hidden ?? false}
                />
              )}
            </Box>
          </Box>
        )}
      </Drawer>
    </Box>
  );
}
