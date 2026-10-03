# Placeholder stub — replace this entire Dockerfile once the real OpenClaw
# image (ghcr.io/opencoatl/openclaw) is published.
#
# This stub runs a minimal Node HTTP server that speaks the OpenClaw wire
# protocol so apps/web can test the adapter without a real OpenClaw instance.

FROM node:22-alpine

WORKDIR /app

COPY stub-server.js .

EXPOSE 3100

CMD ["node", "stub-server.js"]
