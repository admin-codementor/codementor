"use client";

import * as React from "react";

/**
 * Flat illustrations for the Quick Access tiles.
 *
 * Drawn here rather than imported from unDraw for one practical reason: unDraw
 * recolours a single accent only, leaving its dark navy figures fixed, which
 * reads as a dark smudge on our dark theme. These use palette variables
 * throughout, so every shape follows the active colour scheme.
 *
 * One visual language across the set: a soft tonal backdrop, a light object with
 * an outline stroke, and primary-coloured detail.
 */

const BACKDROP = "var(--mui-palette-primaryContainer)";
const SURFACE = "var(--mui-palette-surfaceContainerLowest)";
const LINE = "var(--mui-palette-outline)";
const ACCENT = "var(--mui-palette-primary-main)";
const ACCENT_SOFT = "var(--mui-palette-tertiary)";

type Props = { className?: string };

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 120 90"
      role="presentation"
      aria-hidden
      focusable="false"
      className={className}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      {children}
    </svg>
  );
}

/** Courses / learning — an open book. */
export function LearningArt({ className }: Props) {
  return (
    <Frame className={className}>
      <ellipse cx="60" cy="72" rx="44" ry="10" fill={BACKDROP} />
      <path d="M60 26c-9-6-20-7-29-5v41c9-2 20-1 29 5V26Z" fill={SURFACE} stroke={LINE} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M60 26c9-6 20-7 29-5v41c-9-2-20-1-29 5V26Z" fill={SURFACE} stroke={LINE} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M60 26v41" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M38 34h13M38 42h13M69 34h13M69 42h13" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="93" cy="24" r="6" fill={ACCENT_SOFT} />
    </Frame>
  );
}

/** Assignments — a clipboard with ticked lines. */
export function AssignmentsArt({ className }: Props) {
  return (
    <Frame className={className}>
      <ellipse cx="60" cy="74" rx="40" ry="9" fill={BACKDROP} />
      <rect x="36" y="18" width="48" height="54" rx="6" fill={SURFACE} stroke={LINE} strokeWidth="2.5" />
      <rect x="50" y="12" width="20" height="11" rx="4" fill={ACCENT} />
      <path d="M45 37l4 4 7-8" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M45 52l4 4 7-8" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M62 39h14M62 54h14" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
    </Frame>
  );
}

/** Tests — a clock over a paper. */
export function TestsArt({ className }: Props) {
  return (
    <Frame className={className}>
      <ellipse cx="60" cy="74" rx="40" ry="9" fill={BACKDROP} />
      <rect x="30" y="20" width="40" height="50" rx="6" fill={SURFACE} stroke={LINE} strokeWidth="2.5" />
      <path d="M39 34h18M39 44h18M39 54h11" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="80" cy="46" r="19" fill={SURFACE} stroke={LINE} strokeWidth="2.5" />
      <path d="M80 36v10l7 5" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M73 24l6-5M87 24l-6-5" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
    </Frame>
  );
}

/** Practice — a terminal window. */
export function PracticeArt({ className }: Props) {
  return (
    <Frame className={className}>
      <ellipse cx="60" cy="74" rx="42" ry="9" fill={BACKDROP} />
      <rect x="22" y="20" width="76" height="50" rx="7" fill={SURFACE} stroke={LINE} strokeWidth="2.5" />
      <path d="M22 33h76" stroke={LINE} strokeWidth="2.5" />
      <circle cx="31" cy="26.5" r="2.5" fill={ACCENT} />
      <circle cx="40" cy="26.5" r="2.5" fill={ACCENT_SOFT} />
      <path d="M38 45l-6 6 6 6" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M52 45l6 6-6 6" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M68 57h16" stroke={LINE} strokeWidth="3" strokeLinecap="round" />
    </Frame>
  );
}

/** My class — three people. */
export function ClassArt({ className }: Props) {
  return (
    <Frame className={className}>
      <ellipse cx="60" cy="72" rx="44" ry="10" fill={BACKDROP} />
      <circle cx="30" cy="36" r="9" fill={SURFACE} stroke={LINE} strokeWidth="2.5" />
      <path d="M16 64c0-8 6-14 14-14s14 6 14 14" fill={SURFACE} stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="90" cy="36" r="9" fill={SURFACE} stroke={LINE} strokeWidth="2.5" />
      <path d="M76 64c0-8 6-14 14-14s14 6 14 14" fill={SURFACE} stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="60" cy="30" r="11" fill={ACCENT} />
      <path d="M43 66c0-9 7.6-17 17-17s17 8 17 17" fill={ACCENT} />
    </Frame>
  );
}

/** Roadmap — a path with milestones and a flag. */
export function RoadmapArt({ className }: Props) {
  return (
    <Frame className={className}>
      <ellipse cx="60" cy="74" rx="42" ry="9" fill={BACKDROP} />
      <path
        d="M24 64c14 0 10-16 24-16s10-16 24-16h12"
        stroke={LINE}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="6 7"
        fill="none"
      />
      <circle cx="24" cy="64" r="6" fill={ACCENT} />
      <circle cx="48" cy="48" r="6" fill={ACCENT} />
      <circle cx="72" cy="32" r="6" fill={SURFACE} stroke={LINE} strokeWidth="2.5" />
      <path d="M88 32V14" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M88 16h14l-4 5 4 5H88V16Z" fill={ACCENT_SOFT} />
    </Frame>
  );
}
