# ─── Stage 1: Build Frontend ──────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app

# shared types are aliased as @shared in the frontend
COPY shared/ ./shared/

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build


# ─── Stage 2: Build Backend ───────────────────────────────────
FROM node:20-alpine AS backend-build

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci

COPY backend/ .
# Generate Prisma client then compile TypeScript
RUN npx prisma generate && npx tsc


# ─── Stage 3: Production Image ────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app/backend

# Copy all node_modules from build stage (includes prisma CLI for migrate deploy)
COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/package.json ./package.json

# Prisma schema is required at runtime for migrate deploy
COPY backend/prisma ./prisma

# Frontend dist — Express serves this for the SPA
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# Run migrations then start the server
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/index.js"]
