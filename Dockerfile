# Stage 1: Install dependencies and build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies early (for caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy rest of the app and build it
COPY . .
RUN npm run build

# Stage 2: Run app with production settings
FROM node:20-alpine AS runner

WORKDIR /app

# Set non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
USER nextjs

# Copy only necessary files from builder
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/package-lock.json ./package-lock.json

# Install only production dependencies
RUN npm ci --omit=dev

# Generate Prisma client for Alpine compatibility
RUN npx prisma generate

# Environment variables
ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

# Start the app
CMD ["npm", "start"]