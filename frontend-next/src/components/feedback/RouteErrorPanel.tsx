"use client";

import * as React from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { HomeOutlinedIcon, RefreshIcon } from "@/components/ui/icons";
import { ReportProblemButton } from "./ReportProblem";

/**
 * What a page shows when it crashes while rendering, INSIDE the menu and header (the full-page version is app/error.tsx). Only the page area is
 * replaced, so the person can still use the menu, and what they already submitted is safe. Next.js's `digest` matches the server log.
 */
export function RouteErrorPanel({ error, retry, home }: { error: unknown; retry: () => void; home: string }) {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
  React.useEffect(() => { console.error(error); }, [error]); // for developers; the person never sees the technical text

  return (
    <Box sx={{ display: "grid", placeItems: "center", py: 8, px: 2 }} role="alert">
      <Stack alignItems="center" spacing={1} sx={{ textAlign: "center", maxWidth: 460 }}>
        <Typography variant="h5" component="h1" fontWeight={700}>Something went wrong on this page</Typography>
        <Typography variant="body2" color="text.secondary">
          This was not your fault, and anything you already submitted is safe. Try again. If it keeps happening, you can use the rest of the menu and tell us about it.
        </Typography>
        {digest && <Typography variant="caption" color="text.secondary" sx={{ userSelect: "all" }}>Reference: <b>{digest}</b>. Quote it if you contact support.</Typography>}
        <Stack direction="row" spacing={1.5} sx={{ pt: 2 }}>
          <Button variant="contained" startIcon={<RefreshIcon />} onClick={() => retry()}>Try again</Button>
          <Button component={NextLink} href={home} variant="outlined" startIcon={<HomeOutlinedIcon />}>Home</Button>
        </Stack>
        <ReportProblemButton requestId={/^[A-Za-z0-9._-]{8,64}$/.test(digest) ? digest : undefined} code="PAGE_CRASH" />
      </Stack>
    </Box>
  );
}
