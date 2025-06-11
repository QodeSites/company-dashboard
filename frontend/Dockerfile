# Stage 1: Install dependencies and build
FROM node:20-alpine AS builder

WORKDIR /app

# Update npm to recommended version and clear any existing cache
RUN npm install -g npm@11.4.1 && \
    npm cache clean --force && \
    rm -rf /root/.npm/_cacache

# Install dependencies early (for caching)
COPY package.json package-lock.json ./

# Install with reduced parallelism and memory usage to avoid space issues
RUN npm ci --maxsockets=1 --prefer-offline --no-audit --no-fund && \
    npm cache clean --force

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy rest of the app and build it
COPY . .
RUN npm run build && \
    # Clean up build artifacts and cache to save space
    npm cache clean --force && \
    rm -rf /root/.npm/_cacache && \
    rm -rf node_modules/.cache

# Stage 2: Run app with production settings
FROM node:20-alpine AS runner

WORKDIR /app

# Update npm in runner stage
RUN npm install -g npm@11.4.1

# Create non-root user and group
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Set ownership of /app and npm cache directory
RUN chown -R nextjs:nodejs /app && \
    mkdir -p /home/nextjs/.npm && \
    chown -R nextjs:nodejs /home/nextjs/.npm

# Copy only necessary files from builder with correct ownership
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/package-lock.json ./package-lock.json

# Switch to non-root user
USER nextjs

# Install only production dependencies with space-saving options
RUN npm cache clean --force && \
    npm ci --omit=dev --maxsockets=1 --prefer-offline --no-audit --no-fund && \
    npm cache clean --force

# Generate Prisma client for Alpine compatibility
RUN npx prisma generate

# Environment variables
ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

# Start the app
CMD ["npm", "start"]