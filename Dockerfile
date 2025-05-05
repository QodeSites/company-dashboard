# Stage 1: Install dependencies and build
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies early (for caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy rest of the app and build it
COPY . .
RUN npm run build

# Stage 2: Run app with production settings
FROM node:18-alpine AS runner

WORKDIR /app

# Copy built app from builder
COPY --from=builder /app ./

# Install only production dependencies
RUN npm ci --omit=dev

# If using Prisma, generate client again for Alpine compatibility
RUN npx prisma generate

ENV NODE_ENV=production
EXPOSE 3002

CMD ["npm", "start"]
