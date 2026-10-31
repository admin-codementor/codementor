"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import { CloudOffIcon } from "@/components/ui/icons";

/**
 * Says so when the connection drops, and when it comes back. A page that quietly stops working on a bad network looks broken; this tells the
 * person what is going on and that they can carry on once they are back. It does not stop them from working, and it never hides the page.
 */
export function OnlineBanner() {
  const [state, setState] = React.useState<"online" | "offline" | "back">("online");

  React.useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) setState("offline");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = () => { clearTimeout(timer); setState("offline"); };
    const on = () => { setState("back"); timer = setTimeout(() => setState("online"), 4000); };
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => { window.removeEventListener("offline", off); window.removeEventListener("online", on); clearTimeout(timer); };
  }, []);

  if (state === "online") return null;
  const offline = state === "offline";
  return (
    <Box role="status" aria-live="polite" sx={{
      position: "fixed", left: 0, right: 0, bottom: 16, mx: "auto", width: "fit-content", maxWidth: "calc(100% - 32px)", zIndex: (t) => t.zIndex.snackbar + 1,
      display: "flex", alignItems: "center", gap: 1, px: 2, py: 1, borderRadius: "999px", boxShadow: 3, typography: "body2", fontWeight: 600,
      bgcolor: offline ? "errorContainer" : "successContainer", color: offline ? "onErrorContainer" : "onSuccessContainer",
    }}>
      {offline && <CloudOffIcon fontSize="small" />}
      {offline ? "You are offline. Your work on this page stays here until you are back." : "You are back online."}
    </Box>
  );
}
