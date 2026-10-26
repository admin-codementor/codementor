"use client";

import * as React from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { CodeIcon, HomeOutlinedIcon, RefreshIcon } from "@/components/ui/icons";

/**
 * Shown when a page crashes while rendering. Without this the person sees a raw framework error screen. It says what happened in plain
 * words, gives the reference to quote (Next.js's `digest` matches the server log), and offers the one thing that can help: try again.
 */
export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";

  React.useEffect(() => {
    // Kept for developers; the person never sees the technical text.
    console.error(error);
  }, [error]);

  return (
    <Box sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", p: 3, bgcolor: "background.default" }} role="alert">
      <Stack alignItems="center" spacing={1} sx={{ textAlign: "center", maxWidth: 440 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: 2, display: "grid", placeItems: "center", bgcolor: "primary.main", color: "primary.contrastText" }}>
            <CodeIcon />
          </Box>
          <Typography variant="h5" fontWeight={700} letterSpacing="-0.01em">CodeMentor</Typography>
        </Stack>

        <Typography variant="h5" component="h1" fontWeight={700}>Something went wrong on this page</Typography>
        <Typography variant="body2" color="text.secondary">
          This was not your fault, and anything you already submitted is safe. Try again, and if it keeps happening, go back to the home page.
        </Typography>
        {digest && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, userSelect: "all" }}>
            Reference: <b>{digest}</b>. Quote it if you contact support.
          </Typography>
        )}

        <Stack direction="row" spacing={1.5} sx={{ mt: 3 }}>
          <Button variant="contained" startIcon={<RefreshIcon />} onClick={() => retry()}>Try again</Button>
          <Button component={NextLink} href="/" variant="outlined" startIcon={<HomeOutlinedIcon />}>Home</Button>
        </Stack>
      </Stack>
    </Box>
  );
}
