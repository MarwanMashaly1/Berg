FROM node:20-alpine AS base
RUN npm install -g pnpm

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/api/package.json ./packages/api/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN pnpm install --frozen-lockfile

# Build shared package
FROM deps AS build
COPY packages/shared ./packages/shared
RUN cd packages/shared && pnpm build 2>/dev/null || true

# Copy api source
COPY packages/api ./packages/api

# Production image
FROM base AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/packages/api ./packages/api

WORKDIR /app/packages/api
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npx", "tsx", "src/index.ts"]
