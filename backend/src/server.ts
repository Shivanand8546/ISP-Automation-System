import http from 'http';
import app from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { connectDatabase, disconnectDatabase } from './config/database';
import { connectRedis, disconnectRedis } from './config/redis';
import { initSocketServer } from './websocket';
import { closeAllWorkers } from './workers';
import { startScheduler } from './workers/scheduler';
import { closeAllQueues } from './queues';

const server = http.createServer(app);

// Initialize Socket.IO
initSocketServer(server);

async function start(): Promise<void> {
  try {
    // Connect database
    await connectDatabase();

    // Connect Redis
    await connectRedis();

    // Start workers
    await import('./workers');
    logger.info('BullMQ workers started');

    // Start scheduler
    await startScheduler();

    // Start HTTP server
    server.listen(config.port, () => {
      logger.info(`
╔══════════════════════════════════════════════╗
║         ISPFlow Backend Server               ║
║         Port: ${config.port}                         ║
║         Environment: ${config.env}               ║
║         API: http://localhost:${config.port}/api/v1  ║
╚══════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  server.close(async () => {
    await closeAllWorkers();
    await closeAllQueues();
    await disconnectDatabase();
    await disconnectRedis();
    logger.info('Server shut down complete');
    process.exit(0);
  });

  // Force exit after 30s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
});

start();
