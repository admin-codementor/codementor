"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Skeleton from "@mui/material/Skeleton";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { RefreshOutlinedIcon, SaveOutlinedIcon, CheckCircleOutlineIcon, ErrorOutlineIcon, LinkOutlinedIcon, EmojiEventsOutlinedIcon } from "@/components/ui/icons";
import api from "@/lib/api";
import { getUser } from "@/lib/auth";
import { useToast } from "@/components/feedback/ToastProvider";
import { EmptyState } from "@/components/ui/States";

interface Profile {
  platform: string;
  handle: string;
  solved: number;
  rating: number | null;
  max_rating: number | null;
  extra: unknown;
  sync_status: string;
  last_synced: string | null;
}
interface LbRow {
  rank: number;
  userId: string;
  name: string;
  department: string | null;
  section: string | null;
  totalSolved: number;
  cfRating: number | null;
  platforms: number;
  byPlatform: Record<string, number>;
}

const META: Record<string, { label: string; live: boolean; placeholder: string }> = {
  codeforces: { label: "Codeforces", live: true, placeholder: "tourist" },
  leetcode: { label: "LeetCode", live: true, placeholder: "your-username" },
  hackerrank: { label: "HackerRank", live: false, placeholder: "profile id" },
  codechef: { label: "CodeChef", live: false, placeholder: "username" },
  gfg: { label: "GeeksforGeeks", live: false, placeholder: "username" },
};
const ORDER = ["codeforces", "leetcode", "hackerrank", "codechef", "gfg"];

function StatusIcon({ status }: { status: string }) {
  if (status === "ok") return <CheckCircleOutlineIcon sx={{ fontSize: 16, color: "success.main" }} />;
  if (status === "error") return <ErrorOutlineIcon sx={{ fontSize: 16, color: "error.main" }} />;
  return <LinkOutlinedIcon sx={{ fontSize: 16, color: "text.secondary" }} />;
}

/** Coding-platform handles editor + college leaderboard — Profile "Coding Profiles" tab. */
export function ProfileCodingProfiles() {
  const [me, setMe] = React.useState<ReturnType<typeof getUser>>(null);
  const [profiles, setProfiles] = React.useState<Record<string, Profile>>({});
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [savingP, setSavingP] = React.useState<string | null>(null);
  const showToast = useToast();

  const [lb, setLb] = React.useState<LbRow[]>([]);
  const [dept, setDept] = React.useState("");
  const [section, setSection] = React.useState("");

  React.useEffect(() => {
    setMe(getUser());
  }, []);

  const loadMine = React.useCallback(() => {
    setLoading(true);
    api
      .get("/api/profiles/me")
      .then((r) => {
        if (r.data?.success) {
          const map: Record<string, Profile> = {};
          const d: Record<string, string> = {};
          for (const p of r.data.data as Profile[]) {
            map[p.platform] = p;
            d[p.platform] = p.handle;
          }
          setProfiles(map);
          setDrafts(d);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadLeaderboard = React.useCallback(() => {
    const q = new URLSearchParams();
    if (dept) q.set("department", dept);
    if (section) q.set("section", section);
    api
      .get("/api/profiles/leaderboard?" + q.toString())
      .then((r) => {
        if (r.data?.success) setLb(r.data.data);
      })
      .catch(() => {});
  }, [dept, section]);

  React.useEffect(() => {
    loadMine();
  }, [loadMine]);
  React.useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const saveHandle = async (platform: string) => {
    setSavingP(platform);
    try {
      await api.put("/api/profiles/me", { platform, handle: drafts[platform] || "" });
      await loadMine();
      showToast((drafts[platform] || "").trim() ? "Saved" : "Removed");
    } catch {
      showToast("Save failed", { severity: "error" });
    } finally {
      setSavingP(null);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.post("/api/profiles/me/sync");
      const errs = ((r.data?.data as { status: string }[]) || []).filter((x) => x.status === "error");
      showToast(
        errs.length ? `Synced — ${errs.length} failed (check handles)` : "Synced successfully",
        errs.length ? { severity: "warning" } : undefined,
      );
      await loadMine();
      loadLeaderboard();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err?.response?.data?.error || "Sync failed", { severity: "error" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Box>
      {/* Handles */}
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", mb: 3 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Box>
              <Typography variant="subtitle2" fontWeight={600}>
                Your accounts
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Codeforces &amp; LeetCode sync live; others are stored as links.
              </Typography>
            </Box>
            <Button size="small" variant="contained" startIcon={<RefreshOutlinedIcon />} onClick={sync} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync my stats"}
            </Button>
          </Stack>

          {loading ? (
            <Stack spacing={1.5}>
              {ORDER.map((pf) => (
                <Skeleton key={pf} height={40} />
              ))}
            </Stack>
          ) : (
            <Stack spacing={2}>
              {ORDER.map((pf) => {
                const m = META[pf];
                const p = profiles[pf];
                return (
                  <Stack key={pf} direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{ width: 110, flexShrink: 0 }}>
                      <Typography variant="body2" fontWeight={500}>
                        {m.label}
                      </Typography>
                      <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: "0.04em", color: m.live ? "success.main" : "text.secondary" }}>
                        {m.live ? "auto-sync" : "link only"}
                      </Typography>
                    </Box>
                    <TextField
                      value={drafts[pf] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [pf]: e.target.value }))}
                      placeholder={m.placeholder}
                      size="small"
                      sx={{ flex: 1 }}
                      slotProps={{ htmlInput: { "aria-label": `${m.label} handle` } }}
                    />
                    <Tooltip title="Save handle">
                      <span>
                        <IconButton onClick={() => saveHandle(pf)} disabled={savingP === pf} aria-label={`Save ${m.label} handle`}>
                          <SaveOutlinedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Box sx={{ width: 150, flexShrink: 0, textAlign: "right" }}>
                      {p ? (
                        <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="flex-end">
                          <StatusIcon status={p.sync_status} />
                          {m.live && p.sync_status === "ok" ? (
                            <Typography variant="caption" sx={{ fontFamily: "ui-monospace, monospace" }}>
                              {p.solved} solved{p.rating ? ` · ${p.rating}` : ""}
                            </Typography>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              {p.sync_status === "error" ? "sync failed" : "saved"}
                            </Typography>
                          )}
                        </Stack>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                );
              })}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Leaderboard */}
      <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
        <CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap spacing={1.5} sx={{ mb: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <EmojiEventsOutlinedIcon sx={{ color: "warning.main", fontSize: 20 }} />
              <Typography variant="subtitle2" fontWeight={600}>
                College Coding Leaderboard
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField value={dept} onChange={(e) => setDept(e.target.value)} placeholder="Dept" size="small" sx={{ width: 110 }} slotProps={{ htmlInput: { "aria-label": "Filter by department" } }} />
              <TextField value={section} onChange={(e) => setSection(e.target.value)} placeholder="Sec" size="small" sx={{ width: 80 }} slotProps={{ htmlInput: { "aria-label": "Filter by section" } }} />
            </Stack>
          </Stack>

          {lb.length === 0 ? (
            <EmptyState
              icon={<EmojiEventsOutlinedIcon />}
              title="No synced profiles yet"
              description='Add your handles and click "Sync my stats".'
            />
          ) : (
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table aria-label="College coding leaderboard" sx={{ minWidth: 560 }}>
                <TableHead>
                  <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 600, borderColor: "outlineVariant" } }}>
                    <TableCell sx={{ width: 48 }}>#</TableCell>
                    <TableCell>Student</TableCell>
                    <TableCell align="right">Total solved</TableCell>
                    <TableCell align="right">CF rating</TableCell>
                    <TableCell align="right">Platforms</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lb.map((r) => {
                    const mine = me != null && r.userId === String(me.id);
                    return (
                      <TableRow
                        key={r.userId}
                        hover
                        sx={{
                          bgcolor: mine ? "primaryContainer" : undefined,
                          "& td": { borderColor: "outlineVariant" },
                          "&:last-child td": { border: 0 },
                        }}
                      >
                        <TableCell sx={{ fontFamily: "ui-monospace, monospace", color: "text.secondary" }}>{r.rank}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Typography variant="body2" fontWeight={500}>
                              {r.name}
                            </Typography>
                            {mine && <Chip label="you" size="small" sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: "primary.main", color: "primary.contrastText" }} />}
                            {(r.department || r.section) && (
                              <Typography variant="caption" color="text.secondary">
                                {[r.department, r.section && `Sec ${r.section}`].filter(Boolean).join(" · ")}
                              </Typography>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: "ui-monospace, monospace", color: "success.main", fontWeight: 600 }}>{r.totalSolved}</TableCell>
                        <TableCell align="right" sx={{ fontFamily: "ui-monospace, monospace", color: "text.secondary" }}>{r.cfRating ?? "—"}</TableCell>
                        <TableCell align="right" sx={{ fontFamily: "ui-monospace, monospace", color: "text.secondary" }}>{r.platforms}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
