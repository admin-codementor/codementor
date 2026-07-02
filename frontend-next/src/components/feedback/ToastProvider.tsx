"use client";

import * as React from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert, { type AlertColor } from "@mui/material/Alert";

/**
 * App-wide toast/snackbar. One instance mounted at the root; any component calls
 * `useToast()` to show transient feedback — replaces the per-page Snackbar/Alert
 * patterns so success/error feedback looks and behaves identically everywhere.
 */
interface ToastOptions {
  severity?: AlertColor;
  duration?: number;
}
type ShowToast = (message: string, options?: ToastOptions) => void;

const ToastContext = React.createContext<ShowToast | null>(null);

interface ToastState {
  open: boolean;
  message: string;
  severity: AlertColor;
  duration: number;
  key: number;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ToastState>({
    open: false,
    message: "",
    severity: "success",
    duration: 3500,
    key: 0,
  });

  const showToast = React.useCallback<ShowToast>((message, options) => {
    setState((prev) => ({
      open: true,
      message,
      severity: options?.severity ?? "success",
      duration: options?.duration ?? 3500,
      key: prev.key + 1,
    }));
  }, []);

  const handleClose = (_?: unknown, reason?: string) => {
    if (reason === "clickaway") return;
    setState((s) => ({ ...s, open: false }));
  };

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <Snackbar
        key={state.key}
        open={state.open}
        autoHideDuration={state.duration}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={handleClose}
          severity={state.severity}
          variant="filled"
          sx={{ width: "100%", boxShadow: 6 }}
        >
          {state.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

/** Returns `showToast(message, { severity, duration })`. Throws if used outside the provider. */
export function useToast(): ShowToast {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
