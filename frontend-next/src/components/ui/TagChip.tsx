"use client";

import Chip from "@mui/material/Chip";

// "two-pointers" / "dynamic_programming" -> "Two Pointers" / "Dynamic Programming"
function formatTag(tag: string): string {
  return tag
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Neutral M3 tonal chip for a problem topic tag. Sized and weighted to match
 * DifficultyChip so the two sit together as one visual family instead of a
 * bold filled chip next to a faint outlined one.
 */
export function TagChip({ tag, size = "small" }: { tag: string; size?: "small" | "medium" }) {
  return (
    <Chip
      label={formatTag(tag)}
      size={size}
      sx={{ bgcolor: "surfaceContainerHigh", color: "onSurfaceVariant", fontWeight: 500 }}
    />
  );
}
