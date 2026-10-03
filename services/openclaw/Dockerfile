# WHINK MCP gateway (services/openclaw). Aggregates upstream MCP servers.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx tsc -p tsconfig.build.json

FROM node:22-alpine
# Extra OS packages for upstream servers, set from docker-compose.yml build args.
# Example for Python MCP servers: EXTRA_APK: "uv"
ARG EXTRA_APK=""
RUN if [ -n "$EXTRA_APK" ]; then apk add --no-cache $EXTRA_APK; fi
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir -p /home/node/.npm /home/node/.cache && chown -R node:node /home/node
USER node
EXPOSE 3100
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3100/healthz >/dev/null || exit 1
CMD ["node", "dist/index.js"]
