"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { EmojiEventsOutlinedIcon, MilitaryTechOutlinedIcon, LocalFireDepartmentOutlinedIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { getUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchField } from "@/components/ui/SearchField";
import { SegmentedButtons } from "@/components/ui/SegmentedButtons";
import { RatingBadge } from "@/components/ui/RatingBadge";
import { EmptyState } from "@/components/ui/States";
import { Reveal } from "@/components/ui/motion";

interface LeaderboardEntry {
  id: string;
  rank: number;
  name: string;
  rating: number;
  department?: string | null;
  section?: string | null;
  score: number;
  solvedCount: number;
  totalSubmissions: number;
}

interface RatingEntry {
  id: string;
  rank: number;
  name: string;
  rating: number;
  contestsParticipated: number;
}

type Board = "solved" | "rating";

// Metallic medal accents for the top-3 podium. Gold maps to the theme's warning
// role; silver/bronze have no theme equivalent, so they live here as documented
// constants rather than magic hex inline (same convention as RatingBadge's tiers).
const MEDAL = {
  gold: "var(--mui-palette-warning-main)",
  silver: "#9CA3AF",
  bronze: "#B45309",
} as const;

function avatarInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function RankCell({ rank }: { rank: number }) {
  if (rank === 1) return <EmojiEventsOutlinedIcon sx={{ color: MEDAL.gold }} />;
  if (rank === 2) return <MilitaryTechOutlinedIcon sx={{ color: MEDAL.silver }} />;
  if (rank === 3) return <MilitaryTechOutlinedIcon sx={{ color: MEDAL.bronze }} />;
  return (
    <Typography
      component="span"
      variant="body2"
      color="text.secondary"
      sx={{ fontFamily: "ui-monospace, monospace" }}
    >
      {rank}
    </Typography>
  );
}

function tierLabel(rank: number): { label: string; color: string } | null {
  if (rank === 1) return { label: "Grandmaster", color: "var(--mui-palette-warning-main)" };
  if (rank <= 3) return { label: "Master", color: "var(--mui-palette-ai)" };
  if (rank <= 10) return { label: "Diamond", color: "var(--mui-palette-primary-main)" };
  if (rank <= 25) return { label: "Platinum", color: "var(--mui-palette-success-main)" };
  return null;
}

function YouChip() {
  return (
    <Chip
      label="You"
      size="small"
      sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: "primaryContainer", color: "onPrimaryContainer" }}
    />
  );
}

export default function LeaderboardPage() {
  const [board, setBoard] = React.useState<Board>("solved");
  const [search, setSearch] = React.useState("");
  const [dept, setDept] = React.useState("all");

  const [data, setData] = React.useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [ratingData, setRatingData] = React.useState<RatingEntry[]>([]);
  const [ratingLoading, setRatingLoading] = React.useState(false);
  const [ratingLoaded, setRatingLoaded] = React.useState(false);

  const [currentUserId, setCurrentUserId] = React.useState<string | undefined>();

  React.useEffect(() => {
    const u = getUser();
    setCurrentUserId(u?.id != null ? String(u.id) : undefined);
  }, []);

  React.useEffect(() => {
    api
      .get<{ success: boolean; data: LeaderboardEntry[] }>("/api/student/leaderboard")
      .then((r) => {
        if (r.data?.success) setData(r.data.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (board === "rating" && !ratingLoaded) {
      setRatingLoading(true);
      api
        .get<{ success: boolean; data: RatingEntry[] }>("/api/rating/leaderboard")
        .then((r) => {
          if (r.data?.success) setRatingData(r.data.data ?? []);
        })
        .catch(() => {})
        .finally(() => {
          setRatingLoading(false);
          setRatingLoaded(true);
        });
    }
  }, [board, ratingLoaded]);

  const departments = Array.from(
    new Set(data.map((u) => u.department).filter(Boolean)),
  ) as string[];

  const me = data.find((u) => String(u.id) === currentUserId);
  const visible = data.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) &&
      (dept === "all" || u.department === dept),
  );

  const subtitle =
    board === "solved"
      ? `Top ${data.length} students ranked by problems solved.`
      : `Top ${ratingData.length} ranked by contest rating.`;

  return (
    <Box>
      <PageHeader
        title="Leaderboard"
        subtitle={subtitle}
        actions={
          <SegmentedButtons<Board>
            value={board}
            onChange={setBoard}
            segments={[
              { value: "solved", label: "By Problems" },
              { value: "rating", label: "By Rating" },
            ]}
            ariaLabel="Leaderboard type"
          />
        }
      />

      {board === "solved" && (
        <>
          {/* Podium */}
          {!loading && data.length >= 3 && (
            <Reveal>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: { xs: 1, sm: 1.5 },
                alignItems: "end",
                mb: 3,
              }}
            >
              {[
                { entry: data[1], place: 2, height: 88, color: MEDAL.silver },
                { entry: data[0], place: 1, height: 120, color: MEDAL.gold },
                { entry: data[2], place: 3, height: 72, color: MEDAL.bronze },
              ].map(({ entry, place, height, color }) => {
                if (!entry) return null;
                const isMe = String(entry.id) === currentUserId;
                return (
                  <Stack key={entry.id} alignItems="center" spacing={1}>
                    <Avatar
                      sx={{
                        width: 40,
                        height: 40,
                        fontSize: 14,
                        fontWeight: 700,
                        bgcolor: isMe ? "primary.main" : "surfaceContainerHighest",
                        color: isMe ? "primary.contrastText" : "text.primary",
                      }}
                    >
                      {avatarInitials(entry.name)}
                    </Avatar>
                    <Typography variant="caption" fontWeight={600} noWrap sx={{ maxWidth: 90, textAlign: "center" }}>
                      {entry.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "ui-monospace, monospace" }}>
                      {entry.solvedCount} solved
                    </Typography>
                    <Box
                      sx={{
                        width: "100%",
                        height,
                        display: "grid",
                        placeItems: "center",
                        borderRadius: "8px 8px 0 0",
                        border: "1px solid",
                        borderColor: "outlineVariant",
                        borderBottom: "3px solid",
                        borderBottomColor: color,
                        bgcolor: `color-mix(in srgb, ${color} 12%, transparent)`,
                      }}
                    >
                      <Typography variant="h5" fontWeight={700} sx={{ color }}>
                        #{place}
                      </Typography>
                    </Box>
                  </Stack>
                );
              })}
            </Box>
            </Reveal>
          )}

          {/* Your rank banner */}
          {me && (
            <Card
              variant="outlined"
              sx={{
                mb: 3,
                borderColor: "primary.main",
                borderLeft: "3px solid",
                borderLeftColor: "primary.main",
                bgcolor: "primaryContainer",
              }}
            >
              <Stack direction="row" spacing={2} alignItems="center" sx={{ p: 2 }}>
                <Avatar sx={{ bgcolor: "primary.main", color: "primary.contrastText", fontWeight: 700 }}>
                  {avatarInitials(me.name)}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="subtitle1" fontWeight={600} color="onPrimaryContainer">
                      {me.name}
                    </Typography>
                    <YouChip />
                  </Stack>
                  <Typography variant="caption" color="onPrimaryContainer" sx={{ fontFamily: "ui-monospace, monospace", opacity: 0.85 }}>
                    {me.solvedCount} solved · {me.totalSubmissions} submissions
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "right" }}>
                  <Typography variant="h4" fontWeight={700} color="onPrimaryContainer" sx={{ lineHeight: 1, fontFamily: "ui-monospace, monospace" }}>
                    #{me.rank}
                  </Typography>
                  <Typography variant="caption" color="onPrimaryContainer" sx={{ fontFamily: "ui-monospace, monospace", opacity: 0.85 }}>
                    {me.score.toLocaleString()} pts
                  </Typography>
                </Box>
              </Stack>
            </Card>
          )}

          {/* Filters */}
          <Card variant="outlined" sx={{ p: 1.5, mb: 3, borderColor: "outlineVariant" }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ xs: "stretch", sm: "center" }}>
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder="Search students…"
                label="Search students"
                sx={{ flex: 1, minWidth: 200, maxWidth: { sm: 360 } }}
              />
              {departments.length > 0 && (
                <TextField
                  select
                  size="small"
                  value={dept}
                  onChange={(e) => setDept(e.target.value)}
                  label="Department"
                  sx={{ minWidth: 180 }}
                >
                  <MenuItem value="all">All departments</MenuItem>
                  {departments.map((d) => (
                    <MenuItem key={d} value={d}>
                      {d}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            </Stack>
          </Card>

          {/* Table */}
          <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table aria-label="Leaderboard by problems solved" sx={{ minWidth: 720 }}>
                <TableHead>
                  <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600, borderColor: "outlineVariant" } }}>
                    <TableCell align="center" sx={{ width: 64 }}>Rank</TableCell>
                    <TableCell>Student</TableCell>
                    <TableCell align="right" sx={{ width: 120 }}>Rating</TableCell>
                    <TableCell align="right" sx={{ width: 90 }}>Solved</TableCell>
                    <TableCell align="right" sx={{ width: 100 }}>Score</TableCell>
                    <TableCell align="right" sx={{ width: 120, display: { xs: "none", md: "table-cell" } }}>Submissions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <TableCell key={j} sx={{ display: j === 5 ? { xs: "none", md: "table-cell" } : undefined }}>
                            <Skeleton />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : visible.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ border: 0 }}>
                        <EmptyState
                          icon={<EmojiEventsOutlinedIcon />}
                          title={search ? "No matching students" : "No students yet"}
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    visible.map((u) => {
                      const isMe = String(u.id) === currentUserId;
                      const tier = tierLabel(u.rank);
                      return (
                        <TableRow
                          key={u.id}
                          hover
                          sx={{
                            bgcolor: isMe ? "primaryContainer" : undefined,
                            borderLeft: isMe ? "2px solid" : "2px solid transparent",
                            borderLeftColor: isMe ? "primary.main" : "transparent",
                            "& td": { borderColor: "outlineVariant" },
                            "&:last-child td": { border: 0 },
                          }}
                        >
                          <TableCell align="center">
                            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                              <RankCell rank={u.rank} />
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              <Avatar
                                sx={{
                                  width: 32,
                                  height: 32,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  bgcolor: isMe ? "primary.main" : "surfaceContainerHighest",
                                  color: isMe ? "primary.contrastText" : "text.primary",
                                }}
                              >
                                {avatarInitials(u.name)}
                              </Avatar>
                              <Box sx={{ minWidth: 0 }}>
                                <Stack direction="row" spacing={1} alignItems="center">
                                  <Typography variant="body2" fontWeight={500} noWrap>
                                    {u.name}
                                  </Typography>
                                  {isMe && <YouChip />}
                                </Stack>
                                {tier && (
                                  <Stack direction="row" spacing={0.25} alignItems="center" sx={{ color: tier.color }}>
                                    <LocalFireDepartmentOutlinedIcon sx={{ fontSize: 12 }} />
                                    <Typography variant="caption" fontWeight={600} sx={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                      {tier.label}
                                    </Typography>
                                  </Stack>
                                )}
                              </Box>
                            </Stack>
                          </TableCell>
                          <TableCell align="right">
                            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                              <RatingBadge rating={u.rating} />
                            </Box>
                          </TableCell>
                          <TableCell align="right" sx={{ fontFamily: "ui-monospace, monospace", fontWeight: 600, color: "success.main" }}>
                            {u.solvedCount}
                          </TableCell>
                          <TableCell align="right" sx={{ fontFamily: "ui-monospace, monospace", fontWeight: 600, color: "primary.main" }}>
                            {u.score.toLocaleString()}
                          </TableCell>
                          <TableCell align="right" sx={{ fontFamily: "ui-monospace, monospace", color: "text.secondary", display: { xs: "none", md: "table-cell" } }}>
                            {u.totalSubmissions}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>

          {data.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", mt: 2 }}>
              Score = problems solved × 10 pts · Showing top {data.length} students
            </Typography>
          )}
        </>
      )}

      {board === "rating" && (
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", overflow: "hidden" }}>
          {ratingLoading ? (
            <Box sx={{ p: 2 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} height={48} sx={{ mb: 1 }} />
              ))}
            </Box>
          ) : ratingData.length === 0 ? (
            <EmptyState
              icon={<EmojiEventsOutlinedIcon />}
              title="No rated users yet"
              description="Finalize a contest's ratings first to populate this board."
            />
          ) : (
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table aria-label="Leaderboard by contest rating" sx={{ minWidth: 520 }}>
                <TableHead>
                  <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600, borderColor: "outlineVariant" } }}>
                    <TableCell align="center" sx={{ width: 64 }}>Rank</TableCell>
                    <TableCell>User</TableCell>
                    <TableCell align="right" sx={{ width: 120 }}>Rating</TableCell>
                    <TableCell align="right" sx={{ width: 120, display: { xs: "none", md: "table-cell" } }}>Contests</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ratingData
                    .filter((u) => u.name.toLowerCase().includes(search.toLowerCase()))
                    .map((u) => {
                      const isMe = String(u.id) === currentUserId;
                      return (
                        <TableRow
                          key={u.id}
                          hover
                          sx={{
                            bgcolor: isMe ? "primaryContainer" : undefined,
                            borderLeft: isMe ? "2px solid" : "2px solid transparent",
                            borderLeftColor: isMe ? "primary.main" : "transparent",
                            "& td": { borderColor: "outlineVariant" },
                            "&:last-child td": { border: 0 },
                          }}
                        >
                          <TableCell align="center">
                            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                              <RankCell rank={u.rank} />
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              <Avatar
                                sx={{
                                  width: 32,
                                  height: 32,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  bgcolor: isMe ? "primary.main" : "surfaceContainerHighest",
                                  color: isMe ? "primary.contrastText" : "text.primary",
                                }}
                              >
                                {avatarInitials(u.name)}
                              </Avatar>
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Typography variant="body2" fontWeight={500} noWrap>
                                  {u.name}
                                </Typography>
                                {isMe && <YouChip />}
                              </Stack>
                            </Stack>
                          </TableCell>
                          <TableCell align="right">
                            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                              <RatingBadge rating={u.rating} />
                            </Box>
                          </TableCell>
                          <TableCell align="right" sx={{ fontFamily: "ui-monospace, monospace", color: "text.secondary", display: { xs: "none", md: "table-cell" } }}>
                            {u.contestsParticipated}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Card>
      )}
    </Box>
  );
}
