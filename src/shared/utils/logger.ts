import pino from 'pino';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';

// Register OpenTelemetry instrumentation for Pino to inject trace/span IDs
registerInstrumentations({
  instrumentations: [new PinoInstrumentation()],
});

const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  serializers: {
    err: pino.stdSerializers.err,
  },
  transport: isProduction
    ? pino.transport({
        target: 'pino-opentelemetry-transport',
      })
    : {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
});

// Logger wrapper with required fields
export interface LogContext {
  component?: string;
  guildId?: string | undefined;
  channelId?: string | undefined;
  userId?: string;
  interactionId?: string;
  route?: string;
  status?: string;
  [key: string]: unknown;
}

export interface Logger {
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
  debug: (message: string, context?: LogContext) => void;
  fatal: (message: string, context?: LogContext) => void;
  child: (context: LogContext) => Logger;
}

const createLogger = (defaultContext: LogContext = {}): Logger => {
  const childLogger = logger.child(defaultContext);
  return {
    info: (message: string, context: LogContext = {}) => {
      childLogger.info(context, message);
    },
    warn: (message: string, context: LogContext = {}) => {
      childLogger.warn(context, message);
    },
    error: (message: string, context: LogContext = {}) => {
      childLogger.error(context, message);
    },
    debug: (message: string, context: LogContext = {}) => {
      childLogger.debug(context, message);
    },
    fatal: (message: string, context: LogContext = {}) => {
      childLogger.fatal(context, message);
    },
    child: (context: LogContext) => createLogger({ ...defaultContext, ...context }),
  };
};

// Default logger instance
export const log = createLogger();

export default log;