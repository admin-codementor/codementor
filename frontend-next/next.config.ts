import type { NextConfig } from "next";

// API_PROXY_TARGET is server-only (Docker: http://backend:3001) so it never
// leaks into the browser bundle; NEXT_PUBLIC_API_URL remains the dev fallback.
// Rewrites are serialized into the standalone server at BUILD time, so in
// Docker this must be passed as a build arg, not a runtime env var.
const API_TARGET =
  process.env.API_PROXY_TARGET ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

const isDev = process.env.NODE_ENV !== "production";

// Security headers for every page (F14). The enforced ones cannot break the app. The Content-Security-Policy is REPORT-ONLY for now:
// the browser lists what it would have blocked (to /api/public/csp-report, and in the console) without blocking anything, so we can
// tighten it from real data before enforcing it. Inline scripts and styles are allowed because Next.js and MUI emit them; moving to
// nonces is the later, stricter step.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://accounts.google.com https://apis.google.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://accounts.google.com wss://*.firebaseio.com${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  "frame-src https://accounts.google.com https://*.firebaseapp.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "report-uri /api/public/csp-report",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera and microphone stay available to this site for the exam environment check; everything else off.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()" },
  { key: "Content-Security-Policy-Report-Only", value: csp },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // Emit .next/standalone for the Docker image — a self-contained server.js
  // that runs without node_modules.
  output: "standalone",
  // Proxy /api/* to the (unchanged) Express backend so the frontend can keep
  // making same-origin requests — mirrors the old Vite dev proxy. In production
  // the app runs behind the same reverse proxy, so /api resolves there too.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_TARGET}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
