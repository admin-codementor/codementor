"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { CodeIcon, SmartToyOutlinedIcon, EmojiEventsOutlinedIcon, FingerprintOutlinedIcon, InsightsOutlinedIcon } from "@/components/ui/icons";

const HIGHLIGHTS = [
  { icon: SmartToyOutlinedIcon, title: "Socratic AI Tutor", desc: "Guides you with questions, never hands over the answer." },
  { icon: EmojiEventsOutlinedIcon, title: "Live Contests & Ratings", desc: "ACM-style rounds with real-time leaderboards." },
  { icon: FingerprintOutlinedIcon, title: "Integrity First", desc: "Plagiarism detection & proctored exams built in." },
  { icon: InsightsOutlinedIcon, title: "Placement Analytics", desc: "Track mastery and readiness for recruitment." },
];

/** Decorative left panel for the auth pages. Hidden below the lg breakpoint —
 * purely presentational, so marked aria-hidden for screen readers. */
export function BrandPanel() {
  return (
    <Box
      aria-hidden
      sx={{
        display: { xs: "none", lg: "flex" },
        width: "46%",
        position: "relative",
        overflow: "hidden",
        color: "primary.contrastText",
        background:
          "linear-gradient(135deg, var(--mui-palette-primary-main), var(--mui-palette-tertiary))",
        p: 6,
      }}
    >
      <Stack justifyContent="space-between" sx={{ position: "relative", zIndex: 1, height: "100%" }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 3,
              display: "grid",
              placeItems: "center",
              bgcolor: "rgba(255,255,255,0.18)",
            }}
          >
            <CodeIcon />
          </Box>
          <Typography variant="h5" fontWeight={700} letterSpacing="-0.01em">
            CodeMentor
          </Typography>
        </Stack>

        <Stack spacing={4} sx={{ maxWidth: 420 }}>
          <Box>
            <Typography variant="h2" fontWeight={700} letterSpacing="-0.02em">
              Code. Learn. Grow.
            </Typography>
            <Typography sx={{ mt: 1.5, opacity: 0.85 }}>
              An AI-powered adaptive coding platform that actually teaches — built for engineering
              classrooms.
            </Typography>
          </Box>

          <Stack spacing={2}>
            {HIGHLIGHTS.map((h) => {
              const Icon = h.icon;
              return (
                <Stack key={h.title} direction="row" spacing={1.75} alignItems="flex-start">
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 2,
                      flexShrink: 0,
                      display: "grid",
                      placeItems: "center",
                      bgcolor: "rgba(255,255,255,0.15)",
                    }}
                  >
                    <Icon fontSize="small" />
                  </Box>
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600}>
                      {h.title}
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.75 }}>
                      {h.desc}
                    </Typography>
                  </Box>
                </Stack>
              );
            })}
          </Stack>
        </Stack>

        <Typography variant="caption" sx={{ opacity: 0.6 }}>
          Open-source coding education · Zero-licensing institutional deployment
        </Typography>
      </Stack>
    </Box>
  );
}
