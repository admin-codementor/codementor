"use client";

import * as React from "react";
import Button from "@mui/material/Button";
import { DownloadOutlinedIcon } from "@/components/ui/icons";

/**
 * Rows to CSV. Values are quoted and inner quotes doubled, per RFC 4180, so a
 * student name containing a comma cannot shift every later column.
 *
 * A leading =, +, - or @ is prefixed with a single quote: spreadsheet software
 * treats those as formulas, so a field like `=cmd|...` from user-entered data
 * would otherwise execute on open rather than display.
 */
export function toCsv(rows: Record<string, string | number | null | undefined>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: string | number | null | undefined) => {
    const raw = v == null ? "" : String(v);
    const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n");
}

/**
 * Downloads a CSV built on demand. The data is generated in the browser from
 * what is already loaded, so this never triggers another round trip.
 */
export function ExportButton({
  filename,
  csv,
  disabled,
  label = "Export CSV",
}: {
  filename: string;
  csv: () => string;
  disabled?: boolean;
  label?: string;
}) {
  const onClick = () => {
    const text = csv();
    if (!text) return;
    // A BOM so Excel reads it as UTF-8 — without it, non-ASCII names are mangled.
    const blob = new Blob([`﻿${text}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outlined" size="small" startIcon={<DownloadOutlinedIcon fontSize="small" />} onClick={onClick} disabled={disabled}>
      {label}
    </Button>
  );
}
