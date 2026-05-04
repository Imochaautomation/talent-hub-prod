# ─── Stage 1: Build Frontend ──────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app

# shared types are aliased as @shared in the frontend
COPY shared/ ./shared/

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ .
RUN npm run build


# ─── Stage 2: Build Backend ───────────────────────────────────
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

COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/package.json ./package.json

COPY backend/prisma ./prisma

# Regenerate Prisma client in the production image so the query engine
# binary is built for this exact OS — avoids binary mismatch crashes.
RUN npx prisma generate

# Frontend dist — Express serves this as the SPA
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "dist/index.js"]
