# --- Stage 1: build ---
FROM node:20-alpine AS builder

# ensure npm cache directory
ENV NPM_CONFIG_CACHE=/tmp/npm-cache

# update npm
RUN npm install -g npm@11.4.1

WORKDIR /app

# install dependencies
COPY package.json package-lock.json ./
RUN mkdir -p /tmp/npm-cache \
    && npm ci --cache /tmp/npm-cache --maxsockets=1 --no-audit --no-fund

# generate Prisma client
COPY prisma ./prisma
RUN npx prisma generate

# build app
COPY . .
RUN npm run build \
    && rm -rf /tmp/npm-cache /root/.npm

# --- Stage 2: runtime ---
FROM node:20-alpine AS runner

# update npm
RUN npm install -g npm@11.4.1

WORKDIR /app

# create non-root user
RUN addgroup -S nodejs \
    && adduser -S nextjs -G nodejs

# copy build outputs and production deps
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs

# regenerate Prisma client for Alpine
RUN npx prisma generate

# runtime settings
ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

CMD ["npm", "start"]
