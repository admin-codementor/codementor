import type { Metadata, Viewport } from "next";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import ThemeRegistry from "@/theme/ThemeRegistry";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeMentor",
  description:
    "Intelligent coding assessment platform — practice, contests, and placement prep.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF8FF" },
    { media: "(prefers-color-scheme: dark)", color: "#121318" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // `suppressHydrationWarning` on <html> covers the color-scheme class that
    // InitColorSchemeScript writes before React hydrates.
    //
    // It is on <body> for a different reason: browser extensions commonly stamp a
    // class onto <body> before hydration (a screen-recorder adding
    // `class="kapture-loaded"` is what surfaced this), which React reports as a
    // mismatch the app cannot prevent. The flag only applies one level deep — to
    // this element's own attributes and text — so it cannot hide a genuine
    // mismatch inside the tree.
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* Sets the color-scheme class before hydration to prevent a flash. */}
        <InitColorSchemeScript attribute="class" defaultMode="system" />
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
