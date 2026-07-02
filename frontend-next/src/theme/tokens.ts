/**
 * Material Design 3 design tokens for CodeMentor.
 *
 * A single seed (indigo) expanded into a full M3 tonal role set for light and
 * dark schemes. These are the source of truth for color; theme.ts maps them
 * onto MUI's palette + CSS variables. See https://m3.material.io/styles/color.
 */

export interface M3ColorScheme {
  // Primary
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  // Secondary
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  // Tertiary
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  // Error
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  // Semantic (M3 extended) — used for difficulty/verdict status
  success: string;
  onSuccess: string;
  successContainer: string;
  onSuccessContainer: string;
  warning: string;
  onWarning: string;
  warningContainer: string;
  onWarningContainer: string;
  // AI accent (tutor / assistant surfaces) — distinct from the primary palette
  ai: string;
  onAi: string;
  aiContainer: string;
  onAiContainer: string;
  // Surfaces & background
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  // Outlines
  outline: string;
  outlineVariant: string;
  // Inverse
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  // Misc
  scrim: string;
}

export const lightScheme: M3ColorScheme = {
  primary: "#4654B0",
  onPrimary: "#FFFFFF",
  primaryContainer: "#DEE0FF",
  onPrimaryContainer: "#00115C",

  secondary: "#5A5D72",
  onSecondary: "#FFFFFF",
  secondaryContainer: "#DFE1F9",
  onSecondaryContainer: "#171B2C",

  tertiary: "#76536D",
  onTertiary: "#FFFFFF",
  tertiaryContainer: "#FFD7F0",
  onTertiaryContainer: "#2D1228",

  error: "#BA1A1A",
  onError: "#FFFFFF",
  errorContainer: "#FFDAD6",
  onErrorContainer: "#410002",

  success: "#3B6939",
  onSuccess: "#FFFFFF",
  successContainer: "#BCF0B4",
  onSuccessContainer: "#002105",

  warning: "#7D5700",
  onWarning: "#FFFFFF",
  warningContainer: "#FFDEA8",
  onWarningContainer: "#271900",

  ai: "#6E4EE7",
  onAi: "#FFFFFF",
  aiContainer: "#E7DEFF",
  onAiContainer: "#21005D",

  background: "#FBF8FF",
  onBackground: "#1A1B21",
  surface: "#FBF8FF",
  onSurface: "#1A1B21",
  surfaceVariant: "#E2E1EC",
  onSurfaceVariant: "#45464F",
  surfaceContainerLowest: "#FFFFFF",
  surfaceContainerLow: "#F5F2FA",
  surfaceContainer: "#EFEDF4",
  surfaceContainerHigh: "#E9E7EF",
  surfaceContainerHighest: "#E3E1E9",

  outline: "#767680",
  outlineVariant: "#C6C5D0",

  inverseSurface: "#2F3036",
  inverseOnSurface: "#F1F0F7",
  inversePrimary: "#BAC3FF",

  scrim: "#000000",
};

export const darkScheme: M3ColorScheme = {
  primary: "#BAC3FF",
  onPrimary: "#112978",
  primaryContainer: "#2C3F90",
  onPrimaryContainer: "#DEE0FF",

  secondary: "#C3C5DD",
  onSecondary: "#2C2F42",
  secondaryContainer: "#424659",
  onSecondaryContainer: "#DFE1F9",

  tertiary: "#E5BAD7",
  onTertiary: "#44263D",
  tertiaryContainer: "#5D3C55",
  onTertiaryContainer: "#FFD7F0",

  error: "#FFB4AB",
  onError: "#690005",
  errorContainer: "#93000A",
  onErrorContainer: "#FFDAD6",

  success: "#A1D399",
  onSuccess: "#0A390F",
  successContainer: "#235024",
  onSuccessContainer: "#BCF0B4",

  warning: "#F8BD49",
  onWarning: "#422C00",
  warningContainer: "#5F4100",
  onWarningContainer: "#FFDEA8",

  ai: "#CFBCFF",
  onAi: "#381E72",
  aiContainer: "#4F378B",
  onAiContainer: "#E9DDFF",

  background: "#121318",
  onBackground: "#E3E1E9",
  surface: "#121318",
  onSurface: "#E3E1E9",
  surfaceVariant: "#45464F",
  onSurfaceVariant: "#C6C5D0",
  surfaceContainerLowest: "#0D0E13",
  surfaceContainerLow: "#1A1B21",
  surfaceContainer: "#1E1F25",
  surfaceContainerHigh: "#282A2F",
  surfaceContainerHighest: "#33353A",

  outline: "#90909A",
  outlineVariant: "#45464F",

  inverseSurface: "#E3E1E9",
  inverseOnSurface: "#2F3036",
  inversePrimary: "#4654B0",

  scrim: "#000000",
};

/** M3 type scale (px sizes / line-heights / weights). */
export const typeScale = {
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  // Display
  displayLarge: { fontSize: "3.5625rem", lineHeight: "4rem", fontWeight: 400, letterSpacing: "-0.015625rem" },
  displayMedium: { fontSize: "2.8125rem", lineHeight: "3.25rem", fontWeight: 400 },
  displaySmall: { fontSize: "2.25rem", lineHeight: "2.75rem", fontWeight: 400 },
  // Headline
  headlineLarge: { fontSize: "2rem", lineHeight: "2.5rem", fontWeight: 400 },
  headlineMedium: { fontSize: "1.75rem", lineHeight: "2.25rem", fontWeight: 400 },
  headlineSmall: { fontSize: "1.5rem", lineHeight: "2rem", fontWeight: 400 },
  // Title
  titleLarge: { fontSize: "1.375rem", lineHeight: "1.75rem", fontWeight: 400 },
  titleMedium: { fontSize: "1rem", lineHeight: "1.5rem", fontWeight: 500, letterSpacing: "0.009375rem" },
  titleSmall: { fontSize: "0.875rem", lineHeight: "1.25rem", fontWeight: 500, letterSpacing: "0.00625rem" },
  // Body
  bodyLarge: { fontSize: "1rem", lineHeight: "1.5rem", fontWeight: 400, letterSpacing: "0.03125rem" },
  bodyMedium: { fontSize: "0.875rem", lineHeight: "1.25rem", fontWeight: 400, letterSpacing: "0.015625rem" },
  bodySmall: { fontSize: "0.75rem", lineHeight: "1rem", fontWeight: 400, letterSpacing: "0.025rem" },
  // Label
  labelLarge: { fontSize: "0.875rem", lineHeight: "1.25rem", fontWeight: 500, letterSpacing: "0.00625rem" },
  labelMedium: { fontSize: "0.75rem", lineHeight: "1rem", fontWeight: 500, letterSpacing: "0.03125rem" },
  labelSmall: { fontSize: "0.6875rem", lineHeight: "1rem", fontWeight: 500, letterSpacing: "0.03125rem" },
} as const;

/** M3 shape scale (corner radii, px). */
export const shape = {
  none: 0,
  extraSmall: 4,
  small: 8,
  medium: 12,
  large: 16,
  extraLarge: 28,
  full: 9999,
} as const;

/** M3 state-layer opacities for hover/focus/press. */
export const stateLayerOpacity = {
  hover: 0.08,
  focus: 0.12,
  pressed: 0.12,
  dragged: 0.16,
} as const;
