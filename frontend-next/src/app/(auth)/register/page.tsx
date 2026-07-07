"use client";

import * as React from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
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
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { CodeIcon, SchoolOutlinedIcon, MenuBookOutlinedIcon, VisibilityIcon as Visibility, VisibilityOffIcon as VisibilityOff } from "@/components/ui/icons";
import { setSession, homeForRole } from "@/lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";

type Role = "student" | "faculty";

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
  const [role, setRole] = React.useState<Role>("student");
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
      const res = await axios.post("/api/auth/register", {
        name,
        email,
        password,
        role,
        ...(role === "student"
          ? {
              department: department.trim() || undefined,
              section: section.trim() || undefined,
              year: year ? Number(year) : undefined,
              roll_no: rollNo.trim() || undefined,
            }
          : {}),
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
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || "Registration failed. Try again.");
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
              <Box>
                <Typography variant="subtitle2" component="label" id="role-label" sx={{ mb: 1, display: "block" }}>
                  I am a…
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  value={role}
                  onChange={(_, v: Role | null) => v && setRole(v)}
                  aria-labelledby="role-label"
                >
                  <ToggleButton value="student" sx={{ gap: 1, py: 1.25 }}>
                    <SchoolOutlinedIcon fontSize="small" /> Student
                  </ToggleButton>
                  <ToggleButton value="faculty" sx={{ gap: 1, py: 1.25 }}>
                    <MenuBookOutlinedIcon fontSize="small" /> Faculty
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>

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

              {role === "student" && (
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
              )}

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
