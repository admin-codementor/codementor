"use client";

import * as React from "react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { MenuIcon, CodeIcon } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AccountMenu } from "./AccountMenu";
import { NavigationProgress } from "@/components/ui/motion";
import { hoverTransition, layout, radius } from "@/theme/tokens";


/**
 * Tracks in-flight client-side navigations for the top progress bar, without
 * ever touching the page tree (see `NavigationProgress` in `motion.tsx` for why
 * that matters). Listens for clicks on internal links and clears when the URL
 * actually changes.
 */
function useNavigationProgress(pathname: string) {
  const [active, setActive] = React.useState(false);

  React.useEffect(() => {
    setActive(false);
  }, [pathname]);

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || anchor.target === "_blank") return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname + url.search === window.location.pathname + window.location.search) return;
      setActive(true);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  // Safety net: never leave the bar stuck on if a navigation stalls/errors.
  React.useEffect(() => {
    if (!active) return;
    const timeout = setTimeout(() => setActive(false), 4000);
    return () => clearTimeout(timeout);
  }, [active]);

  return active;
}

export interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Optional group heading; consecutive items sharing a section render under one subheader. */
  section?: string;
}

const DRAWER_WIDTH = 268;

export function AppShell({
  navItems,
  profileHref = "/app/profile",
  homeHref,
  children,
}: {
  navItems: NavItem[];
  profileHref?: string;
  /** Where the logo goes. Defaults to the first nav item, which is each role's home. */
  homeHref?: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const pathname = usePathname();
  const isDesktop = useMediaQuery(theme.breakpoints.up("lg"));
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const navProgressActive = useNavigationProgress(pathname);

  // Close the mobile drawer whenever the route changes.
  React.useEffect(() => setMobileOpen(false), [pathname]);

  // The longest matching href wins, not the first. "/app" is a prefix of every
  // student route, so a first-match rule would light up Home on every page and
  // title them all "Home" — the mobile header reads this label.
  const activeHref = navItems
    .filter((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))
    .reduce<string | null>((best, n) => (best === null || n.href.length > best.length ? n.href : best), null);
  const isActive = (href: string) => href === activeHref;
  const activeLabel = navItems.find((n) => n.href === activeHref)?.label ?? "CodeMentor";

  const drawerContent = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Toolbar sx={{ px: 3 }}>
        {/* The logo is the expected way back to the start — it was inert before. */}
        <Stack
          component={NextLink}
          href={homeHref ?? navItems[0]?.href ?? "/"}
          direction="row"
          spacing={1.5}
          alignItems="center"
          aria-label="CodeMentor home"
          sx={{
            textDecoration: "none",
            color: "inherit",
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
          <Typography variant="h6" fontWeight={700} letterSpacing="-0.01em">
            CodeMentor
          </Typography>
        </Stack>
      </Toolbar>

      <List component="nav" aria-label="Main navigation" sx={{ px: 1.5, flex: 1, overflowY: "auto" }}>
        {navItems.map((item, i) => {
          const active = isActive(item.href);
          const showSection = item.section && item.section !== navItems[i - 1]?.section;
          return (
            <React.Fragment key={item.href}>
              {showSection && (
                <Typography
                  component="li"
                  variant="overline"
                  sx={{
                    display: "block",
                    px: 2,
                    pt: i === 0 ? 0.5 : 2,
                    pb: 0.5,
                    color: "onSurfaceVariant",
                    letterSpacing: "0.08em",
                  }}
                >
                  {item.section}
                </Typography>
              )}
              <ListItem disablePadding sx={{ mb: 0.25 }}>
                <ListItemButton
                  component={NextLink}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  sx={{
                    borderRadius: 9999,
                    px: 2,
                    minHeight: 48,
                    color: active ? "onSecondaryContainer" : "onSurfaceVariant",
                    bgcolor: active ? "secondaryContainer" : "transparent",
                    transition: hoverTransition("background-color"),
                    "&:hover": {
                      bgcolor: active ? "secondaryContainer" : "surfaceContainerHigh",
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40, color: "inherit" }}>{item.icon}</ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    slotProps={{ primary: { fontWeight: active ? 600 : 500, variant: "body2" } }}
                  />
                </ListItemButton>
              </ListItem>
            </React.Fragment>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100dvh", bgcolor: "background.default" }}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <AppBar
        position="fixed"
        sx={{ width: { lg: `calc(100% - ${DRAWER_WIDTH}px)` }, ml: { lg: `${DRAWER_WIDTH}px` } }}
      >
        <Toolbar>
          {!isDesktop && (
            <IconButton
              edge="start"
              aria-label="Open navigation menu"
              onClick={() => setMobileOpen(true)}
              sx={{ mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1, fontWeight: 600 }} noWrap>
            {activeLabel}
          </Typography>
          <ThemeToggle />
          <AccountMenu profileHref={profileHref} />
        </Toolbar>
      </AppBar>

      {/* Navigation: permanent on desktop, modal drawer on smaller screens. */}
      <Box component="nav" sx={{ width: { lg: DRAWER_WIDTH }, flexShrink: { lg: 0 } }} aria-label="Primary">
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: "block", lg: "none" },
            "& .MuiDrawer-paper": { boxSizing: "border-box", width: DRAWER_WIDTH },
          }}
        >
          {drawerContent}
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{
            display: { xs: "none", lg: "block" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: DRAWER_WIDTH,
              borderRight: "1px solid var(--mui-palette-outlineVariant)",
            },
          }}
        >
          {drawerContent}
        </Drawer>
      </Box>

      <Box
        component="main"
        id="main-content"
        sx={{ flexGrow: 1, width: { lg: `calc(100% - ${DRAWER_WIDTH}px)` }, minWidth: 0 }}
      >
        <Toolbar aria-hidden />
        <Box sx={{ p: layout.pageGutter, maxWidth: layout.contentMaxWidth, mx: "auto" }}>
          {children}
        </Box>
      </Box>
      <NavigationProgress active={navProgressActive} />
    </Box>
  );
}
