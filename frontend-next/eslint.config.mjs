import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Flags setState() calls inside useEffect — a common, pre-existing pattern
      // across ~48 files (fetch-on-mount). Real concern, but rewriting all of
      // them is its own deliberate refactor, not a CI-setup side effect. Kept
      // visible as a warning rather than silenced; tracked as future cleanup.
      "react-hooks/set-state-in-effect": "warn",

      // ── Design-system guards (see DESIGN.md) ────────────────────────────
      // These three mistakes are why spacing, corners and type drifted across
      // screens. Warnings for now because existing pages still contain them;
      // each persona phase clears the files it touches, and this flips to
      // "error" once the S8 sweep is done.
      "no-restricted-syntax": [
        "warn",
        {
          // `borderRadius: 2` does NOT mean 2px or 8px — MUI multiplies a bare
          // number by theme.shape.borderRadius (12), so it renders 24px.
          selector:
            "Property[key.name='borderRadius'] > Literal[value=/^[0-9]+(\\.[0-9]+)?$/]",
          message:
            "Bare numbers in borderRadius are multiplied by the theme radius (12), so `2` renders 24px. Use radius.sm / radius.md / radius.lg from @/theme/tokens.",
        },
        {
          // Hard-coded sizes bypass the type scale and read inconsistently.
          selector: "Property[key.name='fontSize'] > Literal[value=/^[0-9]/]",
          message:
            "Don't hard-code fontSize. Use a Typography variant (M3 type scale) or typeScale from @/theme/tokens.",
        },
        {
          // Raw colours don't switch with light/dark and ignore the M3 palette.
          selector:
            "Literal[value=/^#[0-9a-fA-F]{3,8}$|^rgba?\\(/]:not(TSLiteralType > Literal)",
          message:
            "Don't hard-code colours. Use palette roles (e.g. 'primary.main', 'surfaceContainer') or var(--mui-palette-*). Scheme-specific hex belongs in theme/tokens.ts.",
        },
      ],
    },
  },
  {
    // tokens.ts and theme.ts are where the real colour and size values are
    // defined, so the guards above would flag the source of truth itself.
    files: ["src/theme/**"],
    rules: { "no-restricted-syntax": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored, minified Monaco editor assets copied in by copy-monaco.mjs —
    // not source code, never present in a fresh checkout, gitignored.
    "public/monaco/**",
  ]),
]);

export default eslintConfig;
