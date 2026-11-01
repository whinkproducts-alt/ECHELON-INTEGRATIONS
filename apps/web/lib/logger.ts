import { randomUUID } from 'crypto';

export function generateCorrelationId(): string {
  return randomUUID();
}

interface LogContext {
  correlationId?: string;
  userId?: string;
  conversationId?: string;
  persona?: string;
  mambaMode?: string;
  tool?: string;
  latencyMs?: number;
  [key: string]: any;
}

function formatLog(level: string, message: string, ctx: LogContext = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...ctx,
  });
}

export const logger = {
  info: (msg: string, ctx?: LogContext) => console.log(formatLog('INFO', msg, ctx)),
  warn: (msg: string, ctx?: LogContext) => console.warn(formatLog('WARN', msg, ctx)),
  error: (msg: string, ctx?: LogContext) => console.error(formatLog('ERROR', msg, ctx)),
  debug: (msg: string, ctx?: LogContext) => {
    if (process.env.NODE_ENV !== 'production') console.log(formatLog('DEBUG', msg, ctx));
  },
  security: (msg: string, ctx?: LogContext) => console.error(formatLog('SECURITY', msg, ctx)),
};
