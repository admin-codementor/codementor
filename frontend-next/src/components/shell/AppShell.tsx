"use client";

import * as React from "react";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import Avatar from "@mui/material/Avatar";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { MenuIcon, CodeIcon, LogoutIcon, PersonOutlineIcon } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { clearSession, getUser } from "@/lib/auth";
import { SwapFade } from "@/components/ui/motion";
import type { User } from "@/lib/types";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Optional group heading; consecutive items sharing a section render under one subheader. */
  section?: string;
}

const DRAWER_WIDTH = 268;

function initials(name?: string) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function AppShell({
  navItems,
  profileHref = "/app/profile",
  children,
}: {
  navItems: NavItem[];
  profileHref?: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const isDesktop = useMediaQuery(theme.breakpoints.up("lg"));
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [user, setUser] = React.useState<User | null>(null);

  React.useEffect(() => setUser(getUser()), []);
  // Close the mobile drawer whenever the route changes.
  React.useEffect(() => setMobileOpen(false), [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const activeLabel = navItems.find((n) => isActive(n.href))?.label ?? "CodeMentor";

  const handleSignOut = () => {
    clearSession();
    router.replace("/login");
  };

  const drawerContent = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Toolbar sx={{ px: 3 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            aria-hidden
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
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
                    transition: "background-color 150ms ease",
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
          <IconButton
            aria-label="Account menu"
            aria-haspopup="true"
            aria-expanded={anchorEl ? "true" : undefined}
            onClick={(e) => setAnchorEl(e.currentTarget)}
            sx={{ ml: 0.5 }}
          >
            <Avatar sx={{ width: 36, height: 36, bgcolor: "primary.main", color: "primary.contrastText", fontSize: 15 }}>
              {initials(user?.name)}
            </Avatar>
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
          >
            <ListItem sx={{ pt: 0.5, pb: 1 }}>
              <ListItemAvatar>
                <Avatar sx={{ bgcolor: "primary.main", color: "primary.contrastText" }}>
                  {initials(user?.name)}
                </Avatar>
              </ListItemAvatar>
              <Box>
                <Typography variant="subtitle2" noWrap sx={{ maxWidth: 180 }}>
                  {user?.name ?? "—"}
                </Typography>
                {user?.role && (
                  <Chip
                    label={user.role}
                    size="small"
                    sx={{ height: 20, textTransform: "capitalize", bgcolor: "secondaryContainer", color: "onSecondaryContainer" }}
                  />
                )}
              </Box>
            </ListItem>
            <Divider />
            <MenuItem component={NextLink} href={profileHref} onClick={() => setAnchorEl(null)}>
              <ListItemIcon>
                <PersonOutlineIcon fontSize="small" />
              </ListItemIcon>
              Profile
            </MenuItem>
            <MenuItem onClick={handleSignOut}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              Sign out
            </MenuItem>
          </Menu>
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
        <Box sx={{ p: { xs: 2, sm: 3, md: 4 }, maxWidth: 1400, mx: "auto" }}>
          <SwapFade swapKey={pathname}>{children}</SwapFade>
        </Box>
      </Box>
    </Box>
  );
}
