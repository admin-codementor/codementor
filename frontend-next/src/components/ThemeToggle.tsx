"use client";

import * as React from "react";
import { useColorScheme } from "@mui/material/styles";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { LightModeOutlinedIcon, DarkModeOutlinedIcon } from "@/components/ui/icons";

/** Toggles between light and dark color schemes. Avoids hydration mismatch by
 * rendering a stable placeholder until mounted. */
export function ThemeToggle() {
  const { mode, systemMode, setMode } = useColorScheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <IconButton aria-label="Toggle theme" disabled>
        <DarkModeOutlinedIcon />
      </IconButton>
    );
  }

  const resolved = mode === "system" ? systemMode : mode;
  const next = resolved === "dark" ? "light" : "dark";

  return (
    <Tooltip title={`Switch to ${next} theme`}>
      <IconButton
        aria-label={`Switch to ${next} theme`}
        onClick={() => setMode(next)}
      >
        {resolved === "dark" ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
      </IconButton>
    </Tooltip>
  );
}
