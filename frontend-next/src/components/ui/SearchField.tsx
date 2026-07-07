"use client";

import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import { SearchIcon, CloseIcon } from "@/components/ui/icons";

/** Controlled search input with a leading icon and a clear button. Debouncing
 * is the caller's responsibility (keeps this purely presentational). */
export function SearchField({
  value,
  onChange,
  placeholder = "Search…",
  label = "Search",
  fullWidth,
  sx,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  fullWidth?: boolean;
  sx?: object;
}) {
  return (
    <TextField
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      size="small"
      fullWidth={fullWidth}
      sx={sx}
      slotProps={{
        htmlInput: { "aria-label": label },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
          endAdornment: value ? (
            <InputAdornment position="end">
              <IconButton aria-label="Clear search" size="small" onClick={() => onChange("")}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : undefined,
        },
      }}
    />
  );
}
