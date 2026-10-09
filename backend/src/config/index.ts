import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function optional(key: string, defaultValue: string = ''): string {
  return process.env[key] ?? defaultValue;
}

function optionalNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
}

export const config = {
  env: optional('NODE_ENV', 'development'),
  port: optionalNumber('PORT', 4000),
  
  database: {
    url: required('DATABASE_URL'),
  },

  jwt: {
    accessSecret: optional('JWT_ACCESS_SECRET', 'ispflow-access-secret-dev'),
    refreshSecret: optional('JWT_REFRESH_SECRET', 'ispflow-refresh-secret-dev'),
    accessExpiry: optional('JWT_ACCESS_EXPIRY', '15m'),
    refreshExpiry: optional('JWT_REFRESH_EXPIRY', '7d'),
  },

  redis: {
    url: optional('REDIS_URL', 'redis://localhost:6379'),
  },

  cors: {
    origins: optional('CORS_ORIGINS', 'http://localhost:5173').split(','),
  },

  payment: {
    provider: optional('PAYMENT_PROVIDER', 'MOCK').toUpperCase(),
    pendingExpiryMinutes: optionalNumber('PAYMENT_PENDING_EXPIRY_MINUTES', 30),
    razorpay: {
      keyId: optional('RAZORPAY_KEY_ID', ''),
      keySecret: optional('RAZORPAY_KEY_SECRET', ''),
      webhookSecret: optional('RAZORPAY_WEBHOOK_SECRET', ''),
    },
    upi: {
      upiId: optional('UPI_ID', ''),
      payeeName: optional('UPI_PAYEE_NAME', 'ISPFlow'),
    },
  },

  smtp: {
    host: optional('SMTP_HOST'),
    port: optionalNumber('SMTP_PORT', 587),
    user: optional('SMTP_USER'),
    password: optional('SMTP_PASSWORD'),
    from: optional('SMTP_FROM', 'noreply@ispflow.local'),
  },

  app: {
    url: optional('APP_URL', 'http://localhost:4000'),
    frontendUrl: optional('FRONTEND_URL', 'http://localhost:5173'),
    sessionExpiryDays: optionalNumber('SESSION_EXPIRY_DAYS', 7),
    idempotencyKeyTtlHours: optionalNumber('IDEMPOTENCY_KEY_TTL_HOURS', 24),
  },

  monitoring: {
    intervalMs: optionalNumber('MONITOR_INTERVAL_MS', 30000),
    deviceOfflineThresholdMs: optionalNumber('DEVICE_OFFLINE_THRESHOLD_MS', 60000),
    prometheusPort: optionalNumber('PROMETHEUS_PORT', 9090),
  },

  rateLimit: {
    windowMs: optionalNumber('RATE_LIMIT_WINDOW_MS', 60000),
    max: optionalNumber('RATE_LIMIT_MAX', 100),
    authMax: optionalNumber('AUTH_RATE_LIMIT_MAX', 10),
  },

  sla: {
    low: optionalNumber('SLA_LOW', 72),
    medium: optionalNumber('SLA_MEDIUM', 24),
    high: optionalNumber('SLA_HIGH', 8),
    critical: optionalNumber('SLA_CRITICAL', 2),
  },

  isProduction: optional('NODE_ENV', 'development') === 'production',
  isDevelopment: optional('NODE_ENV', 'development') === 'development',
};

const paymentProvider = config.payment.provider;
if (paymentProvider === 'RAZORPAY') {
  const missing = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'].filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required Razorpay env vars for PAYMENT_PROVIDER=RAZORPAY: ${missing.join(', ')}`);
  }
}

if (paymentProvider === 'UPI_MANUAL') {
  const missing = ['UPI_ID'].filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required env vars for PAYMENT_PROVIDER=UPI_MANUAL: ${missing.join(', ')}`);
  }
}
