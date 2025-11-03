const reset = '\x1b[0m';
const cyan = '\x1b[36m';
const red = '\x1b[31m';

const getTimestamp = () => new Date().toISOString();

const formatMessage = (level: string, color: string, message: string) => {
  return `${cyan}[${getTimestamp()}]${reset} ${color}${level.toUpperCase()}${reset}: ${message}`;
};

export const logger = {
  info: (message: string) => {
    console.log(formatMessage('info', cyan, message));
  },
  error: (message: string, error?: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(formatMessage('error', red, `${message} - ${errorMessage}`));
  },
  warn: (message: string) => {
    console.warn(formatMessage('warn', '\x1b[33m', message));
  },
  debug: (message: string) => {
    console.log(formatMessage('debug', '\x1b[35m', message));
  },
};