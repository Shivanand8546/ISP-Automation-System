import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Routes
import authRoutes from './auth/auth.routes';
import customerRoutes from './customers/customer.routes';
import planRoutes from './plans/plan.routes';
import connectionRoutes from './connections/connection.routes';
import subscriptionRoutes from './subscriptions/subscription.routes';
import paymentRoutes from './billing/payment.routes';
import ticketRoutes from './tickets/ticket.routes';
import technicianRoutes from './technicians/technician.routes';
import networkRoutes from './network/network.routes';
import incidentRoutes from './incidents/incident.routes';
import notificationRoutes from './notifications/notification.routes';
import dashboardRoutes from './dashboard/dashboard.routes';
import auditRoutes from './audit/audit.routes';
import invoiceRoutes from './billing/invoice.routes';

const app = express();

// Security
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin: config.cors.origins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Device-Info'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: { success: false, message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing
app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// HTTP logging
app.use(pinoHttp({
  logger,
  redact: ['req.headers.authorization'],
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
}));

// Trust proxy (for accurate IP behind load balancer)
app.set('trust proxy', 1);

// Health checks
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: config.env });
});

app.get('/ready', async (req, res) => {
  try {
    const { prisma } = await import('./config/database');
    await prisma.$queryRaw`SELECT 1`;
    const { getRedisClient } = await import('./config/redis');
    await getRedisClient().ping();
    res.json({ status: 'ready', database: 'connected', redis: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: (error as Error).message });
  }
});

// API Routes
const API_PREFIX = '/api/v1';
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/customers`, customerRoutes);
app.use(`${API_PREFIX}/plans`, planRoutes);
app.use(`${API_PREFIX}/connections`, connectionRoutes);
app.use(`${API_PREFIX}/subscriptions`, subscriptionRoutes);
app.use(`${API_PREFIX}/payments`, paymentRoutes);
app.use(`${API_PREFIX}/invoices`, invoiceRoutes);
app.use(`${API_PREFIX}/tickets`, ticketRoutes);
app.use(`${API_PREFIX}/technicians`, technicianRoutes);
app.use(`${API_PREFIX}/network/devices`, networkRoutes);
app.use(`${API_PREFIX}/incidents`, incidentRoutes);
app.use(`${API_PREFIX}/notifications`, notificationRoutes);
app.use(`${API_PREFIX}/dashboard`, dashboardRoutes);
app.use(`${API_PREFIX}/audit-logs`, auditRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

export default app;
