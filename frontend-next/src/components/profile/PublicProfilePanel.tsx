"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import MuiLink from "@mui/material/Link";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  GppGoodOutlinedIcon,
  LinkOutlinedIcon,
  ContentCopyIcon,
} from "@/components/ui/icons";
import { DataState } from "@/components/ui/DataState";
import { ListSkeleton } from "@/components/ui/Skeletons";
import { useToast } from "@/components/feedback/ToastProvider";
import { radius, layout } from "@/theme/tokens";
import {
  usePublicProfileSettings,
  useSavePublicProfile,
  useStartVerification,
  useConfirmVerification,
  type VerificationChallenge,
} from "@/lib/queries/jobReady";

/**
 * The student's control over their public link.
 *
 * Off by default, and the page says so — publishing is a decision, not a
 * setting that happened to be on. Verification lives here too, because an
 * unverified external account is not shown on the profile at all, and this is
 * where a student would go looking for the reason why.
 */

interface LinkedProfile {
  platform: string;
  handle: string;
  verified: boolean;
  verifiable: boolean;
  solved: number;
}

const PLATFORM_LABEL: Record<string, string> = {
  codeforces: "Codeforces",
  leetcode: "LeetCode",
  codechef: "CodeChef",
  hackerrank: "HackerRank",
  gfg: "GeeksforGeeks",
};

function useLinkedProfiles() {
  return useQuery<LinkedProfile[]>({
    queryKey: ["coding-profiles"],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: LinkedProfile[] }>("/api/profiles/me");
      return res.data?.data ?? [];
    },
  });
}

function VerifyRow({ profile }: { profile: LinkedProfile }) {
  const start = useStartVerification();
  const confirm = useConfirmVerification();
  const showToast = useToast();
  const [challenge, setChallenge] = React.useState<VerificationChallenge | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const label = PLATFORM_LABEL[profile.platform] ?? profile.platform;

  if (profile.verified) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <GppGoodOutlinedIcon fontSize="small" sx={{ color: "success.main" }} />
        <Typography variant="body2" fontWeight={600}>{label}</Typography>
        <Typography variant="body2" color="text.secondary">{profile.handle}</Typography>
        <Chip size="small" color="success" variant="outlined" label="Verified" />
      </Stack>
    );
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="body2" fontWeight={600}>{label}</Typography>
        <Typography variant="body2" color="text.secondary">{profile.handle}</Typography>
        {profile.verifiable ? (
          <Button
            size="small"
            variant="outlined"
            disabled={start.isPending}
            onClick={() => {
              setError(null);
              start.mutate(profile.platform, {
                onSuccess: setChallenge,
                onError: () => setError("Could not start verification. Try again in a minute."),
              });
            }}
          >
            {challenge ? "New code" : "Verify this is mine"}
          </Button>
        ) : (
          <Chip size="small" variant="outlined" label="Cannot be verified automatically" />
        )}
      </Stack>

      {!profile.verifiable && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          {label} does not let us read a profile back, so this account cannot appear on your public
          profile. Codeforces and LeetCode can.
        </Typography>
      )}

      {challenge && (
        <Alert severity="info" sx={{ mt: 1.5, borderRadius: radius.sm }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Put this code in {challenge.where}, save it, then come back and confirm. It is valid for{" "}
            {challenge.expiresInMinutes} minutes and you can remove it afterwards.
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Box
              component="code"
              sx={{
                px: 1, py: 0.5, borderRadius: radius.xs, fontFamily: "ui-monospace, monospace",
                backgroundColor: "surfaceContainerHigh", fontWeight: 600,
              }}
            >
              {challenge.code}
            </Box>
            <Button
              size="small"
              startIcon={<ContentCopyIcon />}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(challenge.code);
                  showToast("Code copied");
                } catch {
                  showToast("Copy it manually — the clipboard is unavailable here", { severity: "warning" });
                }
              }}
            >
              Copy
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={confirm.isPending}
              onClick={() => {
                setError(null);
                confirm.mutate(profile.platform, {
                  onSuccess: () => { setChallenge(null); showToast(`${label} verified`); },
                  onError: (e) => setError(e.message),
                });
              }}
            >
              {confirm.isPending ? "Checking…" : "I have saved it"}
            </Button>
          </Stack>
        </Alert>
      )}

      {error && (
        <Typography variant="caption" color="error.main" sx={{ display: "block", mt: 1 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

export function PublicProfilePanel() {
  const settings = usePublicProfileSettings();
  const save = useSavePublicProfile();
  const linked = useLinkedProfiles();
  const showToast = useToast();

  const [handle, setHandle] = React.useState("");
  const [handleError, setHandleError] = React.useState<string | null>(null);
  const [loadedFor, setLoadedFor] = React.useState<string | null>(null);

  // Seed the field once from the server value, without clobbering what the
  // student is typing on every refetch.
  const serverHandle = settings.data?.handle ?? "";
  if (settings.data && loadedFor === null) {
    setLoadedFor(serverHandle);
    setHandle(serverHandle);
  }

  const published = settings.data?.published ?? false;
  const url = settings.data?.handle ? `${typeof window !== "undefined" ? window.location.origin : ""}/u/${settings.data.handle}` : null;

  const saveHandle = () => {
    setHandleError(null);
    save.mutate({ handle: handle.trim() }, {
      onSuccess: (d) => { setHandle(d.handle ?? ""); showToast("Handle saved"); },
      onError: (e) => setHandleError(e.message),
    });
  };

  const toggle = (patch: { published?: boolean; showScore?: boolean }) => {
    save.mutate(patch, {
      onSuccess: (d) => showToast(
        patch.published !== undefined
          ? (d.published ? "Your profile is live" : "Your profile is no longer public")
          : "Saved",
      ),
      onError: (e) => showToast(e.message, { severity: "error" }),
    });
  };

  return (
    <DataState
      loading={settings.isLoading}
      error={settings.isError ? settings.error : undefined}
      onRetry={settings.refetch}
      skeleton={<ListSkeleton rows={4} />}
    >
      <Stack spacing={layout.sectionGap}>
        <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: layout.cardPadding }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Your public profile link
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: layout.proseMaxWidth }}>
            A page you can put on a resume or send to a recruiter. It shows problems you have solved
            here, judged by us — never anything you type in yourself. It is off until you turn it on,
            and turning it off takes it down straight away.
          </Typography>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "flex-start" }} sx={{ mt: 2.5 }}>
            <TextField
              label="Handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              size="small"
              error={!!handleError}
              helperText={handleError ?? "Lowercase letters, numbers and hyphens"}
              slotProps={{ htmlInput: { maxLength: 30 } }}
              sx={{ flex: 1, minWidth: { sm: 240 } }}
            />
            <Button
              variant="outlined"
              onClick={saveHandle}
              disabled={save.isPending || !handle.trim() || handle.trim() === serverHandle}
              sx={{ mt: { sm: 0.25 } }}
            >
              Save handle
            </Button>
          </Stack>

          {url && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
              <LinkOutlinedIcon fontSize="small" sx={{ color: "text.secondary" }} />
              <Typography variant="body2" sx={{ fontFamily: "ui-monospace, monospace" }}>
                /u/{settings.data?.handle}
              </Typography>
              <Button
                size="small"
                startIcon={<ContentCopyIcon />}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url);
                    showToast("Link copied");
                  } catch {
                    showToast("Copy it from the address bar — the clipboard is unavailable here", { severity: "warning" });
                  }
                }}
              >
                Copy link
              </Button>
              <Button
                size="small"
                component={MuiLink}
                href={`/u/${settings.data?.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                startIcon={<LinkOutlinedIcon />}
              >
                Preview
              </Button>
            </Stack>
          )}

          <Box sx={{ mt: 2.5, borderTop: "1px solid", borderColor: "outlineVariant", pt: 1.5 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={published}
                  disabled={save.isPending || !settings.data?.handle}
                  onChange={(e) => toggle({ published: e.target.checked })}
                />
              }
              label={published ? "Anyone with the link can see it" : "Not published"}
            />
            {!settings.data?.handle && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                Save a handle first.
              </Typography>
            )}
            <FormControlLabel
              control={
                <Switch
                  checked={settings.data?.showScore ?? false}
                  disabled={save.isPending}
                  onChange={(e) => toggle({ showScore: e.target.checked })}
                />
              }
              label="Show my Job-Ready Score on it"
            />
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Your email, phone number and roll number are never on this page, and it asks search
            engines not to index it.
          </Typography>
        </Card>

        <Card variant="outlined" sx={{ borderColor: "outlineVariant", p: layout.cardPadding }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Verified external accounts
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: layout.proseMaxWidth }}>
            An account only appears on your public profile once you have proved it is yours. Anyone
            can type someone else&apos;s handle into a form, which is exactly why an unverified one is
            worth nothing to a recruiter.
          </Typography>

          <DataState
            loading={linked.isLoading}
            error={linked.isError ? linked.error : undefined}
            empty={(linked.data ?? []).length === 0}
            onRetry={linked.refetch}
            compact
            skeleton={<ListSkeleton rows={2} />}
            emptyTitle="No accounts linked"
            emptyDescription="Add a Codeforces or LeetCode handle on the Coding Profiles tab first."
          >
            <Stack spacing={2} sx={{ mt: 2 }}>
              {(linked.data ?? []).map((p) => (
                <VerifyRow key={p.platform} profile={p} />
              ))}
            </Stack>
          </DataState>
        </Card>
      </Stack>
    </DataState>
  );
}
