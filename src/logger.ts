/**
 * Simple logger utility for HOYT Bot
 */

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Default log level
const currentLogLevel = process.env.LOG_LEVEL 
  ? (LogLevel[process.env.LOG_LEVEL as keyof typeof LogLevel] || LogLevel.INFO) 
  : LogLevel.INFO;

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

/**
 * Format the current timestamp for log output
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Log a message with the specified level
 */
function log(level: LogLevel, message: string, data?: unknown): void {
  if (level < currentLogLevel) return;

  const timestamp = getTimestamp();
  let prefix = '';
  
  switch (level) {
    case LogLevel.DEBUG:
      prefix = `${colors.dim}[DEBUG]${colors.reset}`;
      break;
    case LogLevel.INFO:
      prefix = `${colors.green}[INFO]${colors.reset}`;
      break;
    case LogLevel.WARN:
      prefix = `${colors.yellow}[WARN]${colors.reset}`;
      break;
    case LogLevel.ERROR:
      prefix = `${colors.red}[ERROR]${colors.reset}`;
      break;
  }
  
  // Base message
  console.log(`${timestamp} ${prefix} ${message}`);
  
  // Additional data if provided
  if (data !== undefined) {
    if (typeof data === 'object') {
      console.log(colors.dim, JSON.stringify(data, null, 2), colors.reset);
    } else {
      console.log(colors.dim, data, colors.reset);
    }
  }
}

// Export logger functions
export const logger = {
  debug: (message: string, data?: unknown) => log(LogLevel.DEBUG, message, data),
  info: (message: string, data?: unknown) => log(LogLevel.INFO, message, data),
  warn: (message: string, data?: unknown) => log(LogLevel.WARN, message, data),
  error: (message: string, data?: unknown) => log(LogLevel.ERROR, message, data),
  
  // Status updates are important events that should stand out
  status: (message: string) => {
    const timestamp = getTimestamp();
    console.log(`${timestamp} ${colors.bright}${colors.blue}[STATUS]${colors.reset} ${message}`);
  },
  
  // Success messages for completed operations
  success: (message: string) => {
    const timestamp = getTimestamp();
    console.log(`${timestamp} ${colors.bright}${colors.green}[SUCCESS]${colors.reset} ${message}`);
  },
  
  // For critical errors that require immediate attention
  critical: (message: string, error?: Error) => {
    const timestamp = getTimestamp();
    console.log(`${timestamp} ${colors.bright}${colors.red}[CRITICAL]${colors.reset} ${message}`);
    if (error) {
      console.log(colors.red, error.stack || error.message, colors.reset);
    }
  },
  
  // For trade actions
  trade: (message: string, data?: unknown) => {
    const timestamp = getTimestamp();
    console.log(`${timestamp} ${colors.bright}${colors.magenta}[TRADE]${colors.reset} ${message}`);
    if (data !== undefined) {
      console.log(colors.dim, JSON.stringify(data, null, 2), colors.reset);
    }
  }
};

export default logger;