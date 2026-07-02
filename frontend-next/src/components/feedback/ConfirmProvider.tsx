"use client";

import * as React from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";

/**
 * Imperative confirmation dialog: `const ok = await confirm({ ... })`. One
 * instance at the root; standardizes destructive-action confirmation across the
 * app instead of ad-hoc Dialogs or native window.confirm().
 */
export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<Confirm | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null);
  const resolverRef = React.useRef<((v: boolean) => void) | null>(null);

  const confirm = React.useCallback<Confirm>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = (result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={options != null} onClose={() => settle(false)} maxWidth="xs" fullWidth>
        {options && (
          <>
            <DialogTitle>{options.title}</DialogTitle>
            {options.description && (
              <DialogContent>
                <DialogContentText component="div">{options.description}</DialogContentText>
              </DialogContent>
            )}
            <DialogActions>
              <Button onClick={() => settle(false)}>{options.cancelLabel ?? "Cancel"}</Button>
              <Button
                variant="contained"
                color={options.destructive ? "error" : "primary"}
                onClick={() => settle(true)}
                autoFocus
              >
                {options.confirmLabel ?? "Confirm"}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/** Returns `confirm(options): Promise<boolean>`. Throws if used outside the provider. */
export function useConfirm(): Confirm {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
}
