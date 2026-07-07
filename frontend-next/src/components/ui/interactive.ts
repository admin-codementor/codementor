import type { SxProps, Theme } from "@mui/material/styles";

/**
 * Shared hover/press treatment for clickable surfaces (cards, tiles, list rows).
 * One consistent affordance across the app: a subtle lift, a stronger border, and
 * a tonal background on hover. The global `prefers-reduced-motion` override in
 * `theme.ts` neutralizes the transform/transition for motion-sensitive users.
 *
 * Usage: spread onto a Card/Box `sx` — `sx={{ ...interactiveSurfaceSx }}` — and make
 * the element itself focusable/clickable (CardActionArea, button, or role="button").
 */
export const interactiveSurfaceSx: SxProps<Theme> = {
  cursor: "pointer",
  transition: "border-color 150ms ease, background-color 150ms ease, transform 150ms ease, box-shadow 150ms ease",
  "&:hover": {
    borderColor: "outline",
    backgroundColor: "surfaceContainer",
    transform: "translateY(-2px)",
    boxShadow: 3,
  },
  "&:active": {
    transform: "translateY(0)",
    boxShadow: 1,
  },
};
