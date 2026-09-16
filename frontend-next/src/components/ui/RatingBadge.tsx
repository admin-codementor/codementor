"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import { useTheme } from "@mui/material/styles";
import { ratingTierColors, type RatingTierColors } from "@/theme/tokens";

// Codeforces-style rating tiers. Higher rating == cooler tier.
//   < 1200          Newbie     gray
//   1200 – 1399     Pupil      green
//   1400 – 1599     Specialist cyan
//   1600 – 1899     Expert     blue
//   1900 – 2199     Candidate  purple
//   2200+           Master     orange/red
interface Tier {
  label: string;
  color: string;
}

function tierFor(rating: number, colors: RatingTierColors): Tier {
  if (rating < 1200) return { label: "Newbie", color: colors.newbie };
  if (rating < 1400) return { label: "Pupil", color: colors.pupil };
  if (rating < 1600) return { label: "Specialist", color: colors.specialist };
  if (rating < 1900) return { label: "Expert", color: colors.expert };
  if (rating < 2200) return { label: "Candidate", color: colors.candidate };
  return { label: "Master", color: colors.master };
}

/**
 * Monospaced rating pill colored by Codeforces-style tier. The numeric rating
 * is always shown (color reinforces, never replaces, meaning) and the tier
 * name is exposed via tooltip + aria-label.
 */
export function RatingBadge({ rating }: { rating: number }) {
  const mode = useTheme().palette.mode;
  const safe = Number.isFinite(rating) ? Math.round(rating) : 1200;
  const tier = tierFor(safe, ratingTierColors[mode]);

  return (
    <Tooltip title={`${tier.label} · ${safe}`} arrow>
      <Chip
        size="small"
        aria-label={`${tier.label}, rating ${safe}`}
        icon={
          <Box
            aria-hidden
            sx={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              bgcolor: tier.color,
            }}
          />
        }
        label={safe}
        sx={{
          height: 22,
          fontFamily: "ui-monospace, monospace",
          fontWeight: 700,
          fontSize: 12,
          color: tier.color,
          bgcolor: `color-mix(in srgb, ${tier.color} 12%, transparent)`,
          border: "1px solid",
          borderColor: `color-mix(in srgb, ${tier.color} 35%, transparent)`,
          "& .MuiChip-icon": { ml: 1, mr: -0.5 },
        }}
      />
    </Tooltip>
  );
}
