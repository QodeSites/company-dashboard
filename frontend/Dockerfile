# ─── Stage 1: Install & build ───────────────────────────────────────────
FROM node:20-alpine AS builder
# enable BuildKit cache mounts
# syntax = docker/dockerfile:1.4

WORKDIR /app

# update npm
RUN npm install -g npm@11.4.1

# copy only lockfiles for cache-friendly layer
COPY package.json package-lock.json ./

# use BuildKit mount for ~/.npm
RUN --mount=type=cache,id=npm,target=/root/.npm \
    npm ci \
      --cache /root/.npm \
      --prefer-offline \
      --no-audit \
      --no-fund

# generate Prisma client
COPY prisma ./prisma
RUN npx prisma generate

# build
COPY . .
RUN npm run build

# ─── Stage 2: Runtime ─────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app
RUN npm install -g npm@11.4.1

# create unprivileged user
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app ./

USER nextjs
RUN npx prisma generate

ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

CMD ["npm", "start"]
