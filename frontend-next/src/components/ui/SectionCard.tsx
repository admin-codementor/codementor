"use client";

import * as React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

/**
 * Titled content card used across the app to group related content.
 * A leading icon, a title, and an optional right-aligned action slot sit above
 * the children. Border uses `outlineVariant` per DESIGN.md.
 */
export function SectionCard({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card variant="outlined" sx={{ borderColor: "outlineVariant" }}>
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          {icon}
          <Typography variant="subtitle2" fontWeight={600}>
            {title}
          </Typography>
          {action && <Box sx={{ ml: "auto" }}>{action}</Box>}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}
