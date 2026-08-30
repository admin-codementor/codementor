# CodeSphere frontend — Next.js standalone build
# Build:  docker build -t codesphere-frontend .
# The /api rewrite target is baked in at build time (see next.config.ts),
# so point API_PROXY_TARGET at the Docker-internal backend service.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install

FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Server-only rewrite destination — never reaches the browser bundle.
ARG API_PROXY_TARGET=http://backend:3001
ENV API_PROXY_TARGET=$API_PROXY_TARGET
# NEXT_PUBLIC_* values ARE inlined into the browser bundle at build time.
# Deliberately leave NEXT_PUBLIC_API_URL unset in production: the axios client
# uses same-origin /api and the socket client falls back to
# window.location.origin, both routed by the reverse proxy.
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
# Firebase web config — public, non-secret (see .env.example). getAuth() at
# module scope in src/lib/firebase.ts runs during build-time prerendering of
# /login and /register, so these must be present at build, not just runtime.
ARG NEXT_PUBLIC_FIREBASE_API_KEY=
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID=
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
# Standalone output ships its own server.js + pruned node_modules; static
# assets and public/ must be copied alongside it (see Next.js `output` docs).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
