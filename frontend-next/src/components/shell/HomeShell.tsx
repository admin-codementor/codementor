"use client";

import * as React from "react";
import NextLink from "next/link";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { CodeIcon } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AccountMenu } from "./AccountMenu";
import { hoverTransition, layout, radius } from "@/theme/tokens";

/**
 * Chrome for the Home screen: a top bar and nothing else.
 *
 * The sidebar deliberately does not appear here. Home is a launchpad — six
 * choices, full width, nothing competing for attention — and the navigation
 * belongs to the screens you reach from it. Showing both at once gives a
 * student two sets of destinations for the same six places and makes the page
 * feel like a menu attached to a menu.
 *
 * `AppShell` keeps its own identical-looking bar rather than sharing this one,
 * because that bar carries the page title and the mobile drawer button, which
 * have no meaning here.
 */
export function HomeShell({ children, profileHref }: { children: React.ReactNode; profileHref: string }) {
  return (
    <Box sx={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <AppBar position="static">
        <Toolbar>
          <Stack
            component={NextLink}
            href="/app"
            direction="row"
            spacing={1.5}
            alignItems="center"
            aria-label="CodeMentor home"
            sx={{
              textDecoration: "none",
              color: "inherit",
              flexGrow: 1,
              borderRadius: radius.sm,
              transition: hoverTransition("opacity"),
              "&:hover": { opacity: 0.8 },
            }}
          >
            <Box
              aria-hidden
              sx={{
                width: 36,
                height: 36,
                borderRadius: radius.sm,
                display: "grid",
                placeItems: "center",
                bgcolor: "primary.main",
                color: "primary.contrastText",
              }}
            >
              <CodeIcon fontSize="small" />
            </Box>
            <Typography variant="h6" component="span" fontWeight={700} noWrap>
              CodeMentor
            </Typography>
          </Stack>

          <ThemeToggle />
          <AccountMenu profileHref={profileHref} />
        </Toolbar>
      </AppBar>

      <Box
        component="main"
        sx={{
          flex: 1,
          px: layout.pageGutter,
          py: { xs: 3, sm: 5 },
          // Three tiles at a comfortable width, centred, the way a launchpad
          // reads — not stretched across a 24-inch lab monitor.
          maxWidth: 1180,
          width: "100%",
          mx: "auto",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
