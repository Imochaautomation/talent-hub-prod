import express from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import authRoutes from './routes/auth.routes';
import jobArchitectureRoutes from './routes/jobArchitecture.routes';
import employeeRoutes from './routes/employee.routes';
import salaryBandRoutes from './routes/salaryBand.routes';
import dashboardRoutes from './routes/dashboard.routes';
import notificationsRoutes from './routes/notifications.routes';
import payEquityRoutes from './routes/payEquity.routes';
import aiInsightsRoutes from './routes/aiInsights.routes';
import benefitsRoutes from './routes/benefits.routes';
import rsuRoutes from './routes/rsu.routes';
import performanceRoutes from './routes/performance.routes';
import variablePayRoutes from './routes/variablePay.routes';
import scenarioRoutes from './routes/scenarios.routes';
import exportRoutes from './routes/export.routes';
import importRoutes from './routes/import.routes';
import aiChatRoutes from './routes/aiChat.routes';
import aiReportRoutes from './routes/aiReport.routes';
import usersRoutes from './routes/users.routes';
import settingsRoutes from './routes/settings.routes';
import appLogsRoutes from './routes/appLogs.routes';

const app = express();

// Trust Cloudflare / reverse proxy (required for rate-limiter behind tunnels)
app.set('trust proxy', 1);

// ─── Security Headers (Helmet) ────────────────────────────────
// In tunnel/dev mode we need to relax CSP so the Vite hot-reload
// and Cloudflare scripts can load. In production tighten as needed.
app.use(helmet({
  contentSecurityPolicy: false, // Relaxed for tunnel + React SPA
  crossOriginEmbedderPolicy: false,
}));

// ─── Security & Performance ───────────────────────────────────
// When FRONTEND_URL is not set (tunnel / local dev), allow all origins.
// In production with FRONTEND_URL set, restrict to that domain + localhost.
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:5179',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // curl / Postman / server-side
    if (!process.env.FRONTEND_URL) return callback(null, true); // tunnel / dev mode: allow all
    if (origin.endsWith('.trycloudflare.com')) return callback(null, true); // Cloudflare tunnels
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Deny without throwing — browser enforces CORS, server returns 403 not 500
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(compression());

// General API limiter — generous enough for normal SPA usage (React Query fetches,
// socket-triggered refetches, imports, etc.) but still blocks abuse.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many requests, please try again later.' } },
});
app.use('/api', limiter);

// Tight limiter on login only — prevents brute-force credential attacks.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many login attempts, please wait 15 minutes.' } },
});
app.use('/api/auth/login', loginLimiter);

// ─── Body Parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Logging ──────────────────────────────────────────────────
app.use(requestLogger);

// ─── Health Check ─────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Talent Hub API',
    version: '2.0.0',
    env: process.env.NODE_ENV || 'development',
  });
});

// ─── Routes ───────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// Users + invite system — must be BEFORE /api catch-all (jobArchitecture) because
// the invite validation and accept-invite endpoints are PUBLIC (no auth header).
// jobArchitecture.routes.ts applies router.use(authenticate) globally which would
// otherwise intercept and reject un-authenticated /api/users/* requests.
app.use('/api/users', usersRoutes);

// Job Architecture routes: /api/hierarchy, /api/job-areas, /api/bands, etc.
app.use('/api', jobArchitectureRoutes);

app.use('/api/employees', employeeRoutes);

// Salary Bands
app.use('/api/salary-bands', salaryBandRoutes);

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/pay-equity', payEquityRoutes);
app.use('/api/ai-insights', aiInsightsRoutes);
app.use('/api/benefits', benefitsRoutes);
app.use('/api/rsu', rsuRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/variable-pay', variablePayRoutes);
app.use('/api/scenarios', scenarioRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/import', importRoutes);
app.use('/api/ai/chat', aiChatRoutes);
app.use('/api/ai/report', aiReportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/app-logs', appLogsRoutes);

// ─── 404 for unknown API routes ───────────────────────────────
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// ─── Serve Frontend (Tunnel / Production mode) ────────────────
// If frontend/dist exists, serve it from Express so a single port
// covers both the API and the UI (perfect for Cloudflare Tunnel).
const frontendDist = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ─── Error Handler ────────────────────────────────────────────
app.use(errorHandler);

export default app;
