# CodeSphere backend — Node + Java (for JPlag plagiarism detection)
# Must match package.json "engines.node" and the Node version used in CI.
FROM node:22-bookworm-slim

# Java 17 is required by JPlag; curl to fetch the JAR.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openjdk-17-jre-headless curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Fetch a pinned JPlag CLI JAR. Build stays resilient if the release URL changes —
# the app degrades to a clear "JPlag not configured" 503 when the JAR is absent.
ARG JPLAG_VERSION=5.1.0
RUN mkdir -p /app/jplag \
 && (curl -fsSL -o /app/jplag/jplag.jar \
      "https://github.com/jplag/JPlag/releases/download/v${JPLAG_VERSION}/jplag-${JPLAG_VERSION}-jar-with-dependencies.jar" \
    || echo "WARNING: JPlag JAR download failed — mount it at /app/jplag/jplag.jar or set JPLAG_JAR_PATH")
ENV JPLAG_JAR_PATH=/app/jplag/jplag.jar

# Install deps first for better layer caching.
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

EXPOSE 3001
CMD ["node", "src/server.js"]
