# syntax=docker/dockerfile:1.7

# ═══════════════════════════════════════════════════════════════════════════
# RunCanon - single production image (dashboard + CLI + MCP)
# ═══════════════════════════════════════════════════════════════════════════
#
# Build:
#   docker build -t runcanon:latest .
#
# Local demo (full platform: login, admin providers, workspaces):
#   docker build -t runcanon:latest .
#   docker run -p 3000:3000 \
#     -v runcanon-data:/data \
#     -e RUNCANON_DATA_DIR=/data \
#     -e RUNCANON_ADMIN_EMAIL=admin@runcanon.ai \
#     -e RUNCANON_ADMIN_PASSWORD=KeyBoard@2021 \
#     -e RUNCANON_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef \
#     runcanon:latest
#
# Open http://127.0.0.1:3000 and sign in. CLI: runcanon login --server http://127.0.0.1:3000
#
# Run dashboard (legacy single-project mount):
#   docker run -p 3000:3000 -v $(pwd):/project -e RUNCANON_PROJECT_PATH=/project runcanon:latest
#
# Run CLI:
#   docker run -v $(pwd):/project runcanon:latest mine --project /project
#
# Run MCP server (stdio):
#   docker run -i -v $(pwd):/project runcanon:latest mcp
#
# ═══════════════════════════════════════════════════════════════════════════

ARG NODE_VERSION=22.14.0
ARG PNPM_VERSION=9.15.4

FROM node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate \
    && pnpm config set store-dir /root/.pnpm-store

FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY internal/tsconfig/package.json ./internal/tsconfig/
COPY internal/eslint-config/package.json ./internal/eslint-config/
COPY internal/prettier-config/package.json ./internal/prettier-config/
COPY internal/vitest-config/package.json ./internal/vitest-config/

COPY packages/spec/package.json ./packages/spec/
COPY packages/core/package.json ./packages/core/
COPY packages/platform/package.json ./packages/platform/
COPY packages/cli/package.json ./packages/cli/
COPY packages/telemetry/package.json ./packages/telemetry/
COPY packages/mcp/package.json ./packages/mcp/
COPY packages/harness-claude/package.json ./packages/harness-claude/
COPY packages/harness-cursor/package.json ./packages/harness-cursor/
COPY packages/harness-copilot/package.json ./packages/harness-copilot/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/docs/package.json ./apps/docs/

RUN pnpm install --frozen-lockfile --prefer-offline \
    || pnpm install --prefer-offline

FROM deps AS builder
WORKDIR /app

COPY turbo.json tsconfig.json* ./
COPY VERSION ./
COPY .changeset ./.changeset
COPY internal ./internal
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts

RUN pnpm install --offline 2>/dev/null || pnpm install --prefer-offline
ARG RUNCANON_VERSION_BUMP=build
RUN node scripts/bump-version.mjs "${RUNCANON_VERSION_BUMP}"
RUN pnpm run build
RUN apt-get update && apt-get install -y zip && rm -rf /var/lib/apt/lists/* \
    && chmod +x scripts/build-cli-release.sh && ./scripts/build-cli-release.sh

FROM node:${NODE_VERSION}-slim AS production
ENV NODE_ENV=production
ENV PORT=3000
ENV RUNCANON_DATA_DIR=/data
ENV RUNCANON_RELEASES_DIR=/app/releases
ENV RUNCANON_SCRIPTS_DIR=/app/scripts
WORKDIR /app

COPY --from=builder /app/apps/dashboard/build ./apps/dashboard/build
COPY --from=builder /app/apps/dashboard/package.json ./apps/dashboard/package.json
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/releases ./releases
COPY --from=builder /app/scripts ./scripts

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh \
    && ln -sf /app/packages/cli/dist/cli.cjs /usr/local/bin/runcanon \
    && ln -sf /app/packages/mcp/dist/bin.cjs /usr/local/bin/runcanon-mcp

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["dashboard"]
