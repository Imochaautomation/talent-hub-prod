# ─── Stage 1: Build Frontend ──────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app
COPY shared/ ./shared/

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ .
RUN npm run build


# ─── Stage 2: Compile TypeScript ──────────────────────────────
FROM node:20-slim AS backend-build

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/package*.json ./
COPY backend/prisma ./prisma
RUN npm ci --no-audit --no-fund

COPY backend/ .
RUN npx tsc


# ─── Stage 3: Production Image ────────────────────────────────
FROM node:20-slim AS production

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

# Install production deps fresh in this image so all native binaries
# (Prisma query engine) are compiled for this exact runtime environment.
COPY backend/package*.json ./
COPY backend/prisma ./prisma
RUN npm ci --only=production --no-audit --no-fund

# Compiled JS from build stage
COPY --from=backend-build /app/backend/dist ./dist

# Frontend dist — Express serves this as the SPA
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

ENV NODE_ENV=production
EXPOSE 8080

CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/scripts/ensureAdmin.js && node dist/index.js"]
