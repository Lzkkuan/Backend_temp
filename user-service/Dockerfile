# ---- Build stage ----
FROM node:22-alpine AS builder
WORKDIR /app

# Install deps (including dev deps for TS build)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install only production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=builder /app/dist ./dist

# (If you have any runtime assets/config, copy them too)
# COPY .env.production ./.env  # optional

EXPOSE 3001
CMD ["node", "dist/server.js"]
