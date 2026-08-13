"use client";

import * as React from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Alert from "@mui/material/Alert";
import Link from "@mui/material/Link";
import LinearProgress from "@mui/material/LinearProgress";
import { CodeIcon, SchoolOutlinedIcon, VisibilityIcon as Visibility, VisibilityOffIcon as VisibilityOff } from "@/components/ui/icons";
import { setSession, homeForRole } from "@/lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";


const STRENGTH = (pw: string): { label: string; value: number; color: "error" | "warning" | "primary" | "success" } | null => {
  if (pw.length === 0) return null;
  if (pw.length < 6) return { label: "Too short", value: 25, color: "error" };
  if (pw.length < 8) return { label: "Weak", value: 50, color: "warning" };
  if (/[A-Z]/.test(pw) && /\d/.test(pw)) return { label: "Strong", value: 100, color: "success" };
  return { label: "Fair", value: 75, color: "primary" };
};

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [department, setDepartment] = React.useState("");
  const [section, setSection] = React.useState("");
  const [year, setYear] = React.useState("");
  const [rollNo, setRollNo] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const strength = STRENGTH(password);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      const idToken = await cred.user.getIdToken();

      // No `role` is sent — the server ignores it and decides from the
      // verified email domain. See backend/src/controllers/firebaseAuth.controller.js
      const res = await axios.post("/api/auth/firebase", {
        id_token: idToken,
        name,
        department: department.trim() || undefined,
        section: section.trim() || undefined,
        year: year ? Number(year) : undefined,
        roll_no: rollNo.trim() || undefined,
      });
      if (res.data.success) {
        setSession({
          accessToken: res.data.accessToken,
          refreshToken: res.data.refreshToken,
          user: res.data.user,
        });
        router.replace(homeForRole(res.data.user.role));
      }
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/email-already-in-use") {
        setError("Email is already registered");
      } else if (code === "auth/weak-password") {
        setError("Password is too weak");
      } else {
        const e = err as { response?: { data?: { error?: string } } };
        setError(e.response?.data?.error || "Registration failed. Try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      component="main"
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: { xs: 2, sm: 4 },
        bgcolor: "background.default",
        position: "relative",
      }}
    >
      <Box sx={{ position: "absolute", top: 16, right: 16 }}>
        <ThemeToggle />
      </Box>

      <Box sx={{ width: "100%", maxWidth: 480 }}>
        <Stack spacing={1} alignItems="center" sx={{ mb: 3 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2.5,
                display: "grid",
                placeItems: "center",
                bgcolor: "primary.main",
                color: "primary.contrastText",
              }}
            >
              <CodeIcon />
            </Box>
            <Typography variant="h5" fontWeight={700}>
              CodeMentor
            </Typography>
          </Stack>
          <Typography variant="h4" component="h1" fontWeight={600} sx={{ mt: 1 }}>
            Create your account
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Join thousands of students mastering DSA
          </Typography>
        </Stack>

        <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, borderRadius: 4, borderColor: "outlineVariant" }}>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }} role="alert">
              {error}
            </Alert>
          )}

          <form onSubmit={handleRegister}>
            <Stack spacing={2.5}>
              {/* No role selector. Self-registration always creates a student
                  account — the server decides the role from the verified email
                  domain and ignores anything the client sends. Faculty accounts
                  are provisioned by an administrator. */}
              <Alert severity="info" icon={<SchoolOutlinedIcon fontSize="small" />}>
                Creating a student account. Faculty accounts are set up by your
                administrator — contact them if you need one.
              </Alert>

              <TextField
                label="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
                fullWidth
              />
              <TextField
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                fullWidth
              />

              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr" }, gap: 2 }}>
                <TextField label="Roll No." value={rollNo} onChange={(e) => setRollNo(e.target.value)} placeholder="e.g. 21CS045" />
                <TextField label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. CSE" />
                <TextField label="Section" value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. A" />
                <TextField select label="Year" value={year} onChange={(e) => setYear(e.target.value)}>
                  <MenuItem value="">—</MenuItem>
                  {[1, 2, 3, 4].map((y) => (
                    <MenuItem key={y} value={String(y)}>
                      {y}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>

              <Box>
                <TextField
                  label="Password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Min 6 characters"
                  required
                  fullWidth
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            aria-label={showPw ? "Hide password" : "Show password"}
                            onClick={() => setShowPw((v) => !v)}
                            edge="end"
                          >
                            {showPw ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                {strength && (
                  <Box sx={{ mt: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={strength.value}
                      color={strength.color}
                      sx={{ height: 4, borderRadius: 2 }}
                      aria-label="Password strength"
                    />
                    <Typography variant="caption" color={`${strength.color}.main`} sx={{ mt: 0.5, display: "block" }}>
                      {strength.label}
                    </Typography>
                  </Box>
                )}
              </Box>

              <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}>
                {loading ? "Creating account…" : "Create Account"}
              </Button>
            </Stack>
          </form>

          <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 3 }}>
            Already have an account?{" "}
            <Link component={NextLink} href="/login" fontWeight={600}>
              Log in
            </Link>
          </Typography>
        </Paper>

        <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ mt: 2, display: "block" }}>
          By registering, you agree to our Terms of Service and Privacy Policy.
        </Typography>
      </Box>
    </Box>
  );
}
