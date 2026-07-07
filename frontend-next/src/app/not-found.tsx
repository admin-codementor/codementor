"use client";

import * as React from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { CodeIcon, HomeOutlinedIcon, ArrowBackIcon } from "@/components/ui/icons";

export default function NotFound() {
  const router = useRouter();

  return (
    <Box sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", p: 3, bgcolor: "background.default" }}>
      <Stack alignItems="center" spacing={1} sx={{ textAlign: "center", maxWidth: 420 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: 2, display: "grid", placeItems: "center", bgcolor: "primary.main", color: "primary.contrastText" }}>
            <CodeIcon />
          </Box>
          <Typography variant="h5" fontWeight={700} letterSpacing="-0.01em">CodeMentor</Typography>
        </Stack>

        <Typography
          sx={{ fontFamily: "ui-monospace, monospace", fontSize: { xs: 96, sm: 120 }, fontWeight: 800, lineHeight: 1, color: "surfaceContainerHighest", userSelect: "none" }}
          aria-hidden
        >
          404
        </Typography>
        <Typography variant="h5" fontWeight={700}>Page not found</Typography>
        <Typography variant="body2" color="text.secondary">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </Typography>

        <Stack direction="row" spacing={1.5} sx={{ mt: 3 }}>
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => router.back()}>Go back</Button>
          <Button component={NextLink} href="/" variant="contained" startIcon={<HomeOutlinedIcon />}>Home</Button>
        </Stack>
      </Stack>
    </Box>
  );
}
