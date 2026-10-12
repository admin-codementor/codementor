"use client";

import * as React from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ListItem from "@mui/material/ListItem";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemIcon from "@mui/material/ListItemIcon";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import { LogoutIcon, PersonOutlineIcon } from "@/components/ui/icons";
import { clearSession, getUser, ROLE_LABEL } from "@/lib/auth";
import type { User } from "@/lib/types";

/**
 * Who you are signed in as, and the way out.
 *
 * Shared by the app shell and the Home screen, which has no sidebar: two
 * copies of a sign-out button is how one of them ends up behaving differently
 * from the other.
 */

export function initialsOf(name?: string) {
  if (!name) return "ST";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

export function AccountMenu({ profileHref }: { profileHref: string }) {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [user, setUser] = React.useState<User | null>(null);

  // localStorage is not available while the page is rendered on the server.
  React.useEffect(() => setUser(getUser()), []);

  const signOut = () => {
    clearSession();
    router.replace("/login");
  };

  return (
    <>
      <IconButton
        aria-label="Account menu"
        aria-haspopup="true"
        aria-expanded={anchorEl ? "true" : undefined}
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{ ml: 0.5 }}
      >
        <Avatar
          sx={{
            width: 36,
            height: 36,
            bgcolor: "primary.main",
            color: "primary.contrastText",
            typography: "body2",
          }}
        >
          {initialsOf(user?.name)}
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
              {initialsOf(user?.name)}
            </Avatar>
          </ListItemAvatar>
          <Box>
            <Typography variant="subtitle2" noWrap sx={{ maxWidth: 180 }}>
              {user?.name ?? "—"}
            </Typography>
            {user?.role && (
              <Chip
                label={ROLE_LABEL[user.role] ?? user.role}
                size="small"
                sx={{ height: 20, bgcolor: "secondaryContainer", color: "onSecondaryContainer" }}
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
        <MenuItem onClick={signOut}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>
    </>
  );
}
