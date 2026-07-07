"use client";

import { createTheme, type PaletteMode, type PaletteOptions } from "@mui/material/styles";
import {
  darkScheme,
  lightScheme,
  shape,
  stateLayerOpacity,
  typeScale,
  type M3ColorScheme,
} from "./tokens";

/**
 * Extend MUI's palette with the Material 3 roles that have no MUI equivalent.
 * With `cssVariables` enabled, MUI emits a CSS custom property for each of
 * these (e.g. `--mui-palette-surfaceContainer`), so they switch with the
 * active color scheme and are reachable via `theme.vars.palette.*`.
 */
declare module "@mui/material/styles" {
  interface Palette {
    primaryContainer: string;
    onPrimaryContainer: string;
    secondaryContainer: string;
    onSecondaryContainer: string;
    tertiary: string;
    onTertiary: string;
    tertiaryContainer: string;
    onTertiaryContainer: string;
    errorContainer: string;
    onErrorContainer: string;
    successContainer: string;
    onSuccessContainer: string;
    warningContainer: string;
    onWarningContainer: string;
    ai: string;
    onAi: string;
    aiContainer: string;
    onAiContainer: string;
    surface: string;
    onSurface: string;
    surfaceVariant: string;
    onSurfaceVariant: string;
    surfaceContainerLowest: string;
    surfaceContainerLow: string;
    surfaceContainer: string;
    surfaceContainerHigh: string;
    surfaceContainerHighest: string;
    outline: string;
    outlineVariant: string;
    inverseSurface: string;
    inverseOnSurface: string;
    inversePrimary: string;
  }
  interface PaletteOptions {
    primaryContainer?: string;
    onPrimaryContainer?: string;
    secondaryContainer?: string;
    onSecondaryContainer?: string;
    tertiary?: string;
    onTertiary?: string;
    tertiaryContainer?: string;
    onTertiaryContainer?: string;
    errorContainer?: string;
    onErrorContainer?: string;
    successContainer?: string;
    onSuccessContainer?: string;
    warningContainer?: string;
    onWarningContainer?: string;
    ai?: string;
    onAi?: string;
    aiContainer?: string;
    onAiContainer?: string;
    surface?: string;
    onSurface?: string;
    surfaceVariant?: string;
    onSurfaceVariant?: string;
    surfaceContainerLowest?: string;
    surfaceContainerLow?: string;
    surfaceContainer?: string;
    surfaceContainerHigh?: string;
    surfaceContainerHighest?: string;
    outline?: string;
    outlineVariant?: string;
    inverseSurface?: string;
    inverseOnSurface?: string;
    inversePrimary?: string;
  }
}

function buildPalette(s: M3ColorScheme, mode: PaletteMode): PaletteOptions {
  return {
    mode,
    primary: { main: s.primary, contrastText: s.onPrimary },
    secondary: { main: s.secondary, contrastText: s.onSecondary },
    error: { main: s.error, contrastText: s.onError },
    warning: { main: s.warning, contrastText: s.onWarning },
    success: { main: s.success, contrastText: s.onSuccess },
    info: { main: s.tertiary, contrastText: s.onTertiary },
    background: { default: s.background, paper: s.surfaceContainerLow },
    text: { primary: s.onSurface, secondary: s.onSurfaceVariant },
    divider: s.outlineVariant,
    // Extended M3 roles
    primaryContainer: s.primaryContainer,
    onPrimaryContainer: s.onPrimaryContainer,
    secondaryContainer: s.secondaryContainer,
    onSecondaryContainer: s.onSecondaryContainer,
    tertiary: s.tertiary,
    onTertiary: s.onTertiary,
    tertiaryContainer: s.tertiaryContainer,
    onTertiaryContainer: s.onTertiaryContainer,
    errorContainer: s.errorContainer,
    onErrorContainer: s.onErrorContainer,
    successContainer: s.successContainer,
    onSuccessContainer: s.onSuccessContainer,
    warningContainer: s.warningContainer,
    onWarningContainer: s.onWarningContainer,
    ai: s.ai,
    onAi: s.onAi,
    aiContainer: s.aiContainer,
    onAiContainer: s.onAiContainer,
    surface: s.surface,
    onSurface: s.onSurface,
    surfaceVariant: s.surfaceVariant,
    onSurfaceVariant: s.onSurfaceVariant,
    surfaceContainerLowest: s.surfaceContainerLowest,
    surfaceContainerLow: s.surfaceContainerLow,
    surfaceContainer: s.surfaceContainer,
    surfaceContainerHigh: s.surfaceContainerHigh,
    surfaceContainerHighest: s.surfaceContainerHighest,
    outline: s.outline,
    outlineVariant: s.outlineVariant,
    inverseSurface: s.inverseSurface,
    inverseOnSurface: s.inverseOnSurface,
    inversePrimary: s.inversePrimary,
  };
}

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "class" },
  colorSchemes: {
    light: { palette: buildPalette(lightScheme, "light") },
    dark: { palette: buildPalette(darkScheme, "dark") },
  },
  shape: { borderRadius: shape.medium },
  typography: {
    fontFamily: typeScale.fontFamily,
    h1: typeScale.displaySmall,
    h2: typeScale.headlineLarge,
    h3: typeScale.headlineMedium,
    h4: typeScale.headlineSmall,
    h5: typeScale.titleLarge,
    h6: { ...typeScale.titleLarge, fontWeight: 500 },
    subtitle1: typeScale.titleMedium,
    subtitle2: typeScale.titleSmall,
    body1: typeScale.bodyLarge,
    body2: typeScale.bodyMedium,
    button: { ...typeScale.labelLarge, textTransform: "none" },
    caption: typeScale.bodySmall,
    overline: { ...typeScale.labelSmall, textTransform: "uppercase" },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ":root": { colorScheme: "light dark" },
        "*:focus-visible": {
          outline: "3px solid var(--mui-palette-primary-main)",
          outlineOffset: 2,
        },
        "@media (prefers-reduced-motion: reduce)": {
          "*, *::before, *::after": {
            animationDuration: "0.01ms !important",
            transitionDuration: "0.01ms !important",
            scrollBehavior: "auto !important",
          },
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { backgroundImage: "none" } },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: "default" },
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: theme.vars.palette.surface,
          color: theme.vars.palette.onSurface,
          borderBottom: `1px solid ${theme.vars.palette.outlineVariant}`,
          backgroundImage: "none",
        }),
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: shape.medium,
          backgroundColor: theme.vars.palette.surfaceContainerLow,
          backgroundImage: "none",
        }),
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: shape.full, textTransform: "none", paddingInline: 24, minHeight: 40 },
        sizeSmall: { minHeight: 32, paddingInline: 16 },
        sizeLarge: { minHeight: 48, paddingInline: 28 },
      },
    },
    MuiIconButton: {
      styleOverrides: { root: { borderRadius: shape.full } },
    },
    MuiCardActionArea: {
      styleOverrides: {
        root: { borderRadius: "inherit" },
        // Let the parent card's own hover treatment carry the affordance; keep
        // the action area's overlay for focus-visible only (subtle on hover).
        focusHighlight: { borderRadius: "inherit" },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          transition: "background-color 150ms ease",
          "&:hover": { backgroundColor: theme.vars.palette.surfaceContainerHigh },
        }),
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: ({ theme }) => ({
          "&.MuiTableRow-hover:hover": {
            backgroundColor: theme.vars.palette.surfaceContainer,
          },
        }),
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: shape.small, fontWeight: 500 },
      },
    },
    MuiTextField: {
      defaultProps: { variant: "outlined" },
    },
    MuiOutlinedInput: {
      styleOverrides: { root: { borderRadius: shape.extraSmall } },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: { borderRadius: shape.full },
        grouped: ({ theme }) => ({
          borderColor: theme.vars.palette.outline,
          textTransform: "none",
          "&.Mui-selected": {
            backgroundColor: theme.vars.palette.secondaryContainer,
            color: theme.vars.palette.onSecondaryContainer,
            "&:hover": { backgroundColor: theme.vars.palette.secondaryContainer },
          },
        }),
      },
    },
    MuiToggleButton: {
      styleOverrides: { root: { textTransform: "none", paddingInline: 16 } },
    },
    MuiDialog: {
      styleOverrides: {
        paper: ({ theme }) => ({
          borderRadius: shape.extraLarge,
          backgroundColor: theme.vars.palette.surfaceContainerHigh,
          backgroundImage: "none",
        }),
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: ({ theme }) => ({
          borderRadius: shape.small,
          backgroundColor: theme.vars.palette.surfaceContainer,
        }),
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: ({ theme }) => ({
          backgroundColor: theme.vars.palette.surfaceContainerLow,
          backgroundImage: "none",
          border: "none",
        }),
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: ({ theme }) => ({
          backgroundColor: theme.vars.palette.inverseSurface,
          color: theme.vars.palette.inverseOnSurface,
          fontSize: typeScale.bodySmall.fontSize,
          borderRadius: shape.extraSmall,
        }),
      },
    },
    MuiLink: {
      defaultProps: { underline: "hover" },
      styleOverrides: { root: { fontWeight: 500 } },
    },
  },
});

export { stateLayerOpacity };
