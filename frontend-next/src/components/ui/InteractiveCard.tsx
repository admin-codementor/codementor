"use client";

import * as React from "react";
import NextLink from "next/link";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import type { SxProps, Theme } from "@mui/material/styles";
import { interactiveSurfaceSx } from "./interactive";

/**
 * A card the whole of which is clickable, with the app's one hover, focus,
 * pressed and selected treatment built in.
 *
 * MUI's `Card` ships no hover style at all, so every page was inventing its
 * own — which is why tiles felt different from one screen to the next. Use this
 * for any card that navigates or toggles; use plain `Card`/`SectionCard` when
 * the card is just a container.
 *
 * It renders a real `<a>` when given `href` and a real `<button>` otherwise, so
 * keyboard focus, Enter/Space and open-in-new-tab all work without extra props.
 */
export function InteractiveCard({
  href,
  onClick,
  selected = false,
  disabled = false,
  ariaLabel,
  sx,
  contentSx,
  children,
}: {
  href?: string;
  onClick?: React.MouseEventHandler;
  /** Pressed/active look for filter-style cards. Sets `aria-pressed`. */
  selected?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  /** Styles for the card itself. */
  sx?: SxProps<Theme>;
  /** Styles for the inner clickable area — usually padding. */
  contentSx?: SxProps<Theme>;
  children: React.ReactNode;
}) {
  return (
    <Card
      variant="outlined"
      sx={[
        {
          borderColor: selected ? "primary.main" : "outlineVariant",
          backgroundColor: selected ? "secondaryContainer" : undefined,
          height: "100%",
          opacity: disabled ? 0.5 : 1,
        },
        !disabled && interactiveSurfaceSx,
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <CardActionArea
        component={href && !disabled ? NextLink : "button"}
        href={href && !disabled ? href : undefined}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-pressed={onClick && !href ? selected : undefined}
        sx={[
          { height: "100%", display: "block", textAlign: "inherit" },
          ...(Array.isArray(contentSx) ? contentSx : [contentSx]),
        ]}
      >
        {children}
      </CardActionArea>
    </Card>
  );
}
