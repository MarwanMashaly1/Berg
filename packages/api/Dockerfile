FROM node:20-alpine AS base
RUN npm install -g pnpm@10

# ── Install all deps (tsx is a devDep used at runtime) ────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/api/package.json ./packages/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN pnpm install --frozen-lockfile

# ── Production image ──────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

# Root node_modules contains hoisted deps + @berg/shared workspace symlink
COPY --from=deps /app/node_modules ./node_modules
# Per-package node_modules for non-hoisted deps
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules

# Workspace manifest (pnpm needs this to resolve symlinks)
COPY package.json pnpm-workspace.yaml ./

# Shared package (tsx resolves @berg/shared → packages/shared/src/index.ts)
COPY packages/shared ./packages/shared

# API source only (no dist, no test files)
COPY packages/api/src ./packages/api/src
COPY packages/api/package.json packages/api/tsconfig.json ./packages/api/

WORKDIR /app/packages/api
ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node_modules/.bin/tsx", "src/index.ts"]
