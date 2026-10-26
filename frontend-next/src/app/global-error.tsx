"use client";

/* eslint-disable no-restricted-syntax -- this file renders as a bare document with no theme or palette, so it uses plain colours on purpose */

/**
 * The last safety net: shown only if the page's own outer layout fails. Next.js renders it as a whole document with none of our styles
 * or theme, so it is self-contained and plain on purpose.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif", background: "#f6f7fb", color: "#1b1b1f", padding: 24 }}>
        <main role="alert" style={{ maxWidth: 440, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>CodeMentor hit a problem</h1>
          <p style={{ margin: "0 0 8px", color: "#5b5b66", lineHeight: 1.5 }}>
            This was not your fault, and anything you already submitted is safe. Please try again in a moment.
          </p>
          {digest && (
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#5b5b66" }}>
              Reference: <b style={{ userSelect: "all" }}>{digest}</b>
            </p>
          )}
          <button
            type="button"
            onClick={() => retry()}
            style={{ padding: "10px 20px", fontSize: 15, borderRadius: 999, border: 0, background: "#4f5bd5", color: "#fff", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
