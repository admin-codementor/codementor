"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { firebaseAuth } from "@/lib/firebase";
import { clearSession, homeForRole, setSession } from "@/lib/auth";
import type { AuthSuccess, User } from "@/lib/types";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CheckCircleOutlineIcon, LockOutlinedIcon, VisibilityIcon, VisibilityOffIcon } from "@/components/ui/icons";
import { shape } from "@/theme/tokens";

const subscribe = () => () => {};
const readUser = () => (typeof window === "undefined" ? null : window.localStorage.getItem("user"));

// The same rules the server enforces (backend/src/utils/passwordGate.js); the server stays the judge.
const MIN_LENGTH = 8;

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ color: ok ? "success.main" : "text.secondary" }}>
      <CheckCircleOutlineIcon fontSize="small" aria-hidden />
      <Typography variant="body2" component="span">
        {children}
        <Box component="span" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{ok ? " (done)" : " (not yet)"}</Box>
      </Typography>
    </Stack>
  );
}

/** First sign-in for a roster account: choose your own password before using anything else. */
export default function ChangePasswordPage() {
  const router = useRouter();
  // false while the server-rendered page is being hydrated: the saved session cannot be read until then,
  // so "no user" during that first pass must not be mistaken for "signed out".
  const hydrated = React.useSyncExternalStore(subscribe, () => true, () => false);
  const raw = React.useSyncExternalStore(subscribe, readUser, () => null);
  const user = React.useMemo<User | null>(() => {
    try { return raw ? (JSON.parse(raw) as User) : null; } catch { return null; }
  }, [raw]);

  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Not signed in, or nothing to change: go where this person belongs.
  React.useEffect(() => {
    if (!hydrated) return;
    if (!user) { router.replace("/login"); return; }
    if (!user.must_change_password) router.replace(homeForRole(user.role));
  }, [hydrated, user, router]);

  if (!user || !user.must_change_password) {
    return <Box sx={{ minHeight: "100dvh", display: "grid", placeItems: "center" }} role="status" aria-label="Loading"><CircularProgress /></Box>;
  }

  const roll = (user.roll_no || "").toLowerCase();
  const long = next.length >= MIN_LENGTH;
  const mixed = /[A-Za-z]/.test(next) && /\d/.test(next);
  const noRoll = next.length > 0 && !(roll && next.toLowerCase().includes(roll)) && !(user.email && user.email.split("@")[0].length >= 4 && next.toLowerCase().includes(user.email.split("@")[0].toLowerCase()));
  const same = next.length > 0 && next === confirm;
  const ready = long && mixed && noRoll && same;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<AuthSuccess>("/api/auth/set-password", { new_password: next });
      setSession({ accessToken: res.data.accessToken, refreshToken: res.data.refreshToken, user: res.data.user });
      // The server changed the password, which ends the browser's Firebase session. Sign back in with the new one so
      // the profile page's own "change password" keeps working. Not needed to use the app, so a failure here is not shown.
      try { await signInWithEmailAndPassword(firebaseAuth, user.email, next); } catch { /* the app session above is already valid */ }
      router.replace(homeForRole(res.data.user.role));
    } catch (err) {
      setError(apiErrorMessage(err, "Could not set your password. Please try again."));
      setBusy(false);
    }
  };

  return (
    <Box component="main" sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", p: { xs: 2, sm: 4 }, bgcolor: "background.default", position: "relative" }}>
      <Box sx={{ position: "absolute", top: 16, right: 16 }}><ThemeToggle /></Box>
      <Paper variant="outlined" sx={{ width: "100%", maxWidth: 460, p: { xs: 3, sm: 4 }, borderRadius: `${shape.extraLarge}px`, borderColor: "outlineVariant" }}>
        <Stack spacing={1} sx={{ mb: 3 }}>
          <Typography variant="h4" component="h1" fontWeight={600}>Choose your password</Typography>
          <Typography variant="body2" color="text.secondary">
            Hi {user.name.split(" ")[0]}. You signed in with a temporary password. Choose one only you know. You will use it from now on.
          </Typography>
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 3 }} role="alert">{error}</Alert>}

        <form onSubmit={submit} noValidate>
          <Stack spacing={2}>
            <TextField
              label="New password" type={show ? "text" : "password"} value={next} onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password" required fullWidth autoFocus
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start"><LockOutlinedIcon fontSize="small" /></InputAdornment>,
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((v) => !v)} edge="end">
                        {show ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <TextField
              label="Confirm new password" type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password" required fullWidth
              error={confirm.length > 0 && !same} helperText={confirm.length > 0 && !same ? "The two passwords do not match." : " "}
            />
            <Stack spacing={0.5} aria-label="Password rules" sx={{ position: "relative" }}>
              <Rule ok={long}>At least {MIN_LENGTH} characters</Rule>
              <Rule ok={mixed}>Letters and numbers</Rule>
              <Rule ok={noRoll}>Does not contain your roll number or email</Rule>
              <Rule ok={same}>Both entries match</Rule>
            </Stack>
            <Button type="submit" variant="contained" size="large" disabled={!ready || busy} startIcon={busy ? <CircularProgress size={16} sx={{ color: "inherit" }} /> : undefined}>
              {busy ? "Saving…" : "Set password and continue"}
            </Button>
          </Stack>
        </form>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
          Not you?{" "}
          <Link component="button" type="button" onClick={() => { clearSession(); router.replace("/login"); }} underline="hover">Sign out</Link>
        </Typography>
      </Paper>
    </Box>
  );
}
