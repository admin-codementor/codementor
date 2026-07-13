# CodeSphere frontend — Next.js standalone build
# Build:  docker build -t codesphere-frontend .
# The /api rewrite target is baked in at build time (see next.config.ts),
# so point API_PROXY_TARGET at the Docker-internal backend service.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
# package-lock.json is gitignored, so a fresh clone falls back to npm install.
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
