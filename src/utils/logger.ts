/** Minimal console logger with timestamps and levels. Never log secrets. */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function log(level: LogLevel, message: string, ...meta: unknown[]): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  switch (level) {
    case 'error':
      console.error(line, ...meta);
      break;
    case 'warn':
      console.warn(line, ...meta);
      break;
    default:
      console.log(line, ...meta);
  }
}

export const logger = {
  debug: (message: string, ...meta: unknown[]) => log('debug', message, ...meta),
  info: (message: string, ...meta: unknown[]) => log('info', message, ...meta),
  warn: (message: string, ...meta: unknown[]) => log('warn', message, ...meta),
  error: (message: string, ...meta: unknown[]) => log('error', message, ...meta),
};
