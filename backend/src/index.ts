import 'dotenv/config';
import http from 'http';
import app from './app';
import { initializeSocket } from './lib/socket';
import { redisClient } from './lib/redis';
import { prisma } from './lib/prisma';
import logger from './lib/logger';
import { runProactiveScan } from './services/aiScan';

const PORT = parseInt(process.env.PORT || '3001', 10);

// ─── Startup Environment Guards ─────────────────────────────
if (!process.env.JWT_SECRET) {
  logger.error('FATAL: JWT_SECRET env var is not set. Server cannot start.');
  process.exit(1);
}
if (!process.env.JWT_REFRESH_SECRET) {
  logger.error('FATAL: JWT_REFRESH_SECRET env var is not set. Server cannot start.');
  process.exit(1);
}

async function bootstrap() {
  try {
    // ─── Test DB Connection ──────────────────────────────────
    await prisma.$connect();
    logger.info('✅ PostgreSQL connected');

    // ─── Test Redis Connection (non-fatal) ──────────────────
    try {
      await redisClient.ping();
      logger.info('✅ Redis connected');
    } catch (redisErr: any) {
      logger.warn('⚠️  Redis unavailable — caching and real-time events degraded:', redisErr.message);
    }

    // ─── Create HTTP Server ──────────────────────────────────
    const server = http.createServer(app);

    // ─── Initialize Socket.io ────────────────────────────────
    initializeSocket(server);
    logger.info('✅ Socket.io initialized');

    // ─── Start Server ────────────────────────────────────────
    server.listen(PORT, () => {
      logger.info(`🚀 Talent Hub API running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
    });

    // ─── Proactive AI Scan (Phase 4) ─────────────────────────
    // Initial scan after 2 min — gives Neon DB time to stay alive after the
    // first real API request wakes it, and gives Socket.io Redis adapter time
    // to attach so critical notifications are delivered in real time.
    // Subsequent scans every 1 hour.
    const INITIAL_SCAN_DELAY_MS = 2 * 60 * 1000; // 2 minutes
    const SCAN_INTERVAL_MS = 60 * 60 * 1000;      // 1 hour

    setTimeout(() => {
      runProactiveScan().catch(err => logger.error('[AI Scan] Initial scan error:', err));
    }, INITIAL_SCAN_DELAY_MS);

    setInterval(() => {
      runProactiveScan().catch(err => logger.error('[AI Scan] Periodic scan error:', err));
    }, SCAN_INTERVAL_MS);

    // ─── Graceful Shutdown ───────────────────────────────────
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        await prisma.$disconnect();
        await redisClient.quit();
        logger.info('Server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
