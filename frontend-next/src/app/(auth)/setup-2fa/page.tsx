"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { clearSession, getUser, homeForRole } from "@/lib/auth";
import { TwoFactorSetup } from "@/components/auth/TwoFactorSetup";
import { ThemeToggle } from "@/components/ThemeToggle";
import { shape } from "@/theme/tokens";
import type { User } from "@/lib/types";

/** First sign-in for an account whose role must use two-factor sign-in (the Training & Placement office): set it up before anything else. */
export default function SetupTwoFactorPage() {
  const router = useRouter();
  const [user, setUser] = React.useState<User | null | undefined>(undefined);

  React.useEffect(() => {
    const u = getUser();
    if (!u) { router.replace("/login"); return; }
    setUser(u);
  }, [router]);

  if (!user) {
    return <Box sx={{ minHeight: "100dvh", display: "grid", placeItems: "center" }} role="status" aria-label="Loading"><CircularProgress /></Box>;
  }

  return (
    <Box component="main" sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", p: { xs: 2, sm: 4 }, bgcolor: "background.default", position: "relative" }}>
      <Box sx={{ position: "absolute", top: 16, right: 16 }}><ThemeToggle /></Box>
      <Paper variant="outlined" sx={{ width: "100%", maxWidth: 560, p: { xs: 3, sm: 4 }, borderRadius: `${shape.extraLarge}px`, borderColor: "outlineVariant" }}>
        <Stack spacing={1} sx={{ mb: 3 }}>
          <Typography variant="h4" component="h1" fontWeight={600}>Set up two-factor sign-in</Typography>
          <Typography variant="body2" color="text.secondary">
            Hi {user.name.split(" ")[0]}. Your role works with every student&apos;s marks and offers, so it needs a second step at sign-in.
            Install an authenticator app (Google Authenticator, Microsoft Authenticator or similar), scan the code, and enter the six digits it shows.
            You cannot turn this off later.
          </Typography>
        </Stack>
        <TwoFactorSetup onEnabled={() => router.replace(homeForRole(user.role))} />
        <Button color="inherit" size="small" sx={{ mt: 3 }} onClick={() => { clearSession(); router.replace("/login"); }}>Sign out</Button>
      </Paper>
    </Box>
  );
}
