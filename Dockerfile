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

# Create non-root user and group
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Set ownership of /app and npm cache directory as root
RUN chown nextjs:nodejs /app && \
    mkdir -p /home/nextjs/.npm && \
    chown nextjs:nodejs /home/nextjs/.npm

# Copy only necessary files from builder with correct ownership
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/package-lock.json ./package-lock.json

# Switch to non-root user
USER nextjs

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