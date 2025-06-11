# Stage 1: Install dependencies and build
FROM node:20-alpine AS builder

WORKDIR /app

# Update npm to recommended version and configure for minimal space usage
RUN npm install -g npm@11.4.1 && \
    npm config set cache /tmp/npm-cache && \
    npm config set tmp /tmp/npm-tmp && \
    mkdir -p /tmp/npm-cache /tmp/npm-tmp

# Install dependencies early (for caching)
COPY package.json package-lock.json ./

# Install with maximum space optimization
RUN npm ci --cache /tmp/npm-cache --tmp /tmp/npm-tmp --maxsockets=1 --no-audit --no-fund --no-optional && \
    rm -rf /tmp/npm-cache /tmp/npm-tmp /root/.npm

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate && rm -rf /root/.npm

# Copy rest of the app and build it
COPY . .
RUN npm run build && \
    # Aggressive cleanup after build
    rm -rf node_modules/.cache /root/.npm /tmp/* && \
    # Keep only production node_modules for copying to runner
    npm ci --omit=dev --no-audit --no-fund --no-optional && \
    rm -rf /root/.npm /tmp/*

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
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Switch to non-root user
USER nextjs

# Generate Prisma client for Alpine compatibility (no need to reinstall deps)
RUN npx prisma generate

# Environment variables
ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

# Start the app
CMD ["npm", "start"]