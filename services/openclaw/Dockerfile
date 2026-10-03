# WHINK MCP gateway (services/openclaw). Aggregates upstream MCP servers.
# Base image pinned by exact version AND digest (multi-arch index). Bump both together.
FROM node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx tsc -p tsconfig.build.json

FROM node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
# Extra OS packages for upstream servers, set from docker-compose.yml build args.
# Example for Python MCP servers: EXTRA_APK: "uv"
ARG EXTRA_APK=""
RUN if [ -n "$EXTRA_APK" ]; then apk add --no-cache $EXTRA_APK; fi
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
# Runs as the unprivileged built-in user (uid 1000). The app tree stays root-owned and read-only;
# runtime writes go to tmpfs mounts declared in docker-compose.yml.
USER node
EXPOSE 3100
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3100/healthz >/dev/null || exit 1
CMD ["node", "dist/index.js"]
