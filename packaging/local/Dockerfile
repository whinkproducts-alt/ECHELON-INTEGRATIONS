# Same multi-architecture Node base already used by the project's gateway.
FROM node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
RUN apk add --no-cache openssl libstdc++ && corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /opt/whink
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/org-kit/package.json packages/org-kit/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY packages packages
# Typecheck keeps the existing social tool-contract regression tests intact.
COPY services/openclaw/upstreams/social/src/tools.ts services/openclaw/upstreams/social/src/tools.ts
RUN pnpm --filter app exec prisma generate
# Build has no real credentials or connection to the owner's database.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build DIRECT_URL=postgresql://build:build@127.0.0.1:5432/build NEXT_TELEMETRY_DISABLED=1 pnpm --filter app exec next build --webpack
RUN chown -R node:node /opt/whink
USER node
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
CMD ["pnpm", "--filter", "app", "exec", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
