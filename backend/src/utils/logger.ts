import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.isDevelopment ? 'debug' : 'info',
  transport: config.isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  redact: {
    paths: [
      'password',
      'passwordHash',
      'refreshToken',
      'accessToken',
      'token',
      'secret',
      '*.password',
      '*.passwordHash',
      '*.refreshToken',
      '*.accessToken',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
});
