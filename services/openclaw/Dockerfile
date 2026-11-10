# WHINK MCP gateway (services/openclaw). Aggregates upstream MCP servers.
# Product images build with INCLUDE_REF_SERVER=false (no reference server, no jszip, no pako).
# docker-compose.yml sets it to "true" for local dev so the ref tools work out of the box.
ARG INCLUDE_REF_SERVER=false

# Base image pinned by exact version AND digest (multi-arch index). Bump both together.
FROM node:26.13.0-alpine3.24@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx tsc -p tsconfig.build.json

# Optional dev-only reference upstream, installed from its own lockfile into /out/ref.
FROM node:26.13.0-alpine3.24@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS ref-true
WORKDIR /out/ref
COPY upstreams/ref/package.json upstreams/ref/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:26.13.0-alpine3.24@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS ref-false
RUN mkdir -p /out

FROM ref-${INCLUDE_REF_SERVER} AS ref

# Social MCP upstream (x, instagram, tiktok). Our own code, always built into the image.
FROM node:26.13.0-alpine3.24@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS social
WORKDIR /out/social
COPY upstreams/social/package.json upstreams/social/package-lock.json ./
RUN npm ci --ignore-scripts
COPY upstreams/social/tsconfig.json upstreams/social/tsconfig.build.json ./
COPY upstreams/social/src ./src
RUN npx tsc -p tsconfig.build.json && npm prune --omit=dev --ignore-scripts && rm -rf src tsconfig*.json

FROM node:26.13.0-alpine3.24@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216
# Extra OS packages for upstream servers, set from docker-compose.yml build args.
# Example for Python MCP servers: EXTRA_APK: "uv"
ARG EXTRA_APK=""
RUN if [ -n "$EXTRA_APK" ]; then apk add --no-cache $EXTRA_APK; fi
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
# Baked stdio upstreams live under /app/upstreams (the only stdio location config accepts besides node_modules).
COPY --from=ref /out /app/upstreams
COPY --from=social /out/social /app/upstreams/social
# Runs as the unprivileged built-in user (uid 1000). The app tree stays root-owned and read-only;
# runtime writes go to tmpfs mounts declared in docker-compose.yml.
USER node
EXPOSE 3100
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3100/healthz >/dev/null || exit 1
CMD ["node", "dist/index.js"]
