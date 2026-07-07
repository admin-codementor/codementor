"use client";

import * as React from "react";
import Script from "next/script";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import Link from "@mui/material/Link";
import { MailOutlineIcon, LockOutlinedIcon, ArrowBackIcon } from "@/components/ui/icons";
import { setSession, homeForRole } from "@/lib/auth";
import type { AuthSuccess } from "@/lib/types";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BrandPanel } from "@/components/auth/BrandPanel";
import { GoogleIcon } from "@/components/auth/GoogleIcon";

type GoogleId = {
  accounts?: {
    id?: {
      initialize: (o: { client_id?: string; callback: (r: { credential: string }) => void }) => void;
      prompt: () => void;
    };
  };
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [twofaRequired, setTwofaRequired] = React.useState(false);
  const [twofaUserId, setTwofaUserId] = React.useState<string | number | null>(null);
  const [code, setCode] = React.useState("");

  const completeLogin = (data: AuthSuccess) => {
    setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
    router.replace(homeForRole(data.user.role));
  };

  const errorMessage = (err: unknown) =>
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await axios.post("/api/auth/login", { email, password });
      if (res.data.success) {
        if (res.data.twofa_required) {
          setTwofaRequired(true);
          setTwofaUserId(res.data.user_id);
        } else {
          completeLogin(res.data);
        }
      }
    } catch (err) {
      setError(errorMessage(err) || "Failed to login");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await axios.post("/api/2fa/verify", { user_id: twofaUserId, token: code.trim() });
      if (res.data.success) completeLogin(res.data);
    } catch (err) {
      setError(errorMessage(err) || "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    setError(null);
    const g = (window as unknown as { google?: GoogleId }).google;
    if (!g?.accounts?.id) {
      setError("Google sign-in is not configured for this deployment.");
      return;
    }
    g.accounts.id.initialize({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      callback: async (resp) => {
        try {
          const res = await axios.post("/api/2fa/google", { id_token: resp.credential });
          if (res.data.success) completeLogin(res.data);
        } catch (err) {
          setError(errorMessage(err) || "Google login failed");
        }
      },
    });
    g.accounts.id.prompt();
  };

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      <Box sx={{ minHeight: "100dvh", display: "flex", bgcolor: "background.default" }}>
        <BrandPanel />

        {/* Form panel */}
        <Box
          component="main"
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: { xs: 3, sm: 6 },
            position: "relative",
          }}
        >
          <Box sx={{ position: "absolute", top: 16, right: 16 }}>
            <ThemeToggle />
          </Box>

          <Paper
            variant="outlined"
            sx={{
              width: "100%",
              maxWidth: 420,
              p: { xs: 3, sm: 4 },
              borderRadius: 4,
              borderColor: "outlineVariant",
            }}
          >
            <Stack spacing={1} sx={{ mb: 3 }}>
              <Typography variant="h4" component="h1" fontWeight={600}>
                {twofaRequired ? "Two-factor verification" : "Welcome back"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {twofaRequired
                  ? "Enter the 6-digit code from your authenticator app."
                  : "Sign in to continue to your workspace."}
              </Typography>
            </Stack>

            {error && (
              <Alert severity="error" sx={{ mb: 3 }} role="alert">
                {error}
              </Alert>
            )}

            {!twofaRequired ? (
              <Stack spacing={2.5}>
                <form onSubmit={handleLogin}>
                  <Stack spacing={2}>
                    <TextField
                      label="Email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="student@university.edu"
                      autoComplete="email"
                      required
                      fullWidth
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <MailOutlineIcon fontSize="small" />
                            </InputAdornment>
                          ),
                        },
                      }}
                    />
                    <TextField
                      label="Password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                      fullWidth
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <LockOutlinedIcon fontSize="small" />
                            </InputAdornment>
                          ),
                        },
                      }}
                    />
                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      disabled={loading}
                      fullWidth
                    >
                      {loading ? "Signing in…" : "Sign In"}
                    </Button>
                  </Stack>
                </form>

                <Divider>
                  <Typography variant="caption" color="text.secondary">
                    or
                  </Typography>
                </Divider>

                <Button
                  type="button"
                  variant="outlined"
                  size="large"
                  fullWidth
                  startIcon={<GoogleIcon />}
                  onClick={handleGoogle}
                >
                  Continue with Google
                </Button>

                <Typography variant="body2" color="text.secondary" textAlign="center">
                  Don&apos;t have an account?{" "}
                  <Link component={NextLink} href="/register" fontWeight={600}>
                    Register
                  </Link>
                </Typography>
              </Stack>
            ) : (
              <form onSubmit={handleVerify2FA}>
                <Stack spacing={2.5}>
                  <TextField
                    label="Authentication code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    autoFocus
                    required
                    fullWidth
                    placeholder="000000"
                    slotProps={{
                      htmlInput: {
                        inputMode: "numeric",
                        style: {
                          textAlign: "center",
                          fontSize: "1.75rem",
                          letterSpacing: "0.5em",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        },
                        "aria-label": "6-digit authentication code",
                      },
                    }}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    fullWidth
                    disabled={loading || code.length !== 6}
                  >
                    {loading ? "Verifying…" : "Verify"}
                  </Button>
                  <Button
                    type="button"
                    variant="text"
                    startIcon={<ArrowBackIcon />}
                    onClick={() => {
                      setTwofaRequired(false);
                      setCode("");
                      setError(null);
                    }}
                  >
                    Back to login
                  </Button>
                </Stack>
              </form>
            )}
          </Paper>
        </Box>
      </Box>
    </>
  );
}
