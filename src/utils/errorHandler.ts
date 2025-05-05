import logger from '../logger';

/**
 * Custom error types for better error handling
 */
export enum ErrorType {
  CONFIGURATION = 'CONFIGURATION',
  NETWORK = 'NETWORK',
  API = 'API',
  CONTRACT = 'CONTRACT',
  VALIDATION = 'VALIDATION',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Custom error class with additional context and meta information
 */
export class HoytError extends Error {
  type: ErrorType;
  context?: Record<string, unknown>;
  originalError?: Error;
  
  constructor(
    message: string, 
    type: ErrorType = ErrorType.UNKNOWN,
    context?: Record<string, unknown>,
    originalError?: Error
  ) {
    super(message);
    this.name = 'HoytError';
    this.type = type;
    this.context = context;
    this.originalError = originalError;
    
    // Captures the stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HoytError);
    }
  }
  
  /**
   * Logs the error with appropriate level and context
   */
  log(): void {
    const errorInfo = {
      type: this.type,
      message: this.message,
      context: this.context,
      stack: this.stack,
      originalError: this.originalError ? {
        message: this.originalError.message,
        stack: this.originalError.stack
      } : undefined
    };
    
    switch (this.type) {
      case ErrorType.CONFIGURATION:
        logger.critical(`Configuration Error: ${this.message}`, this);
        break;
      case ErrorType.NETWORK:
        logger.error(`Network Error: ${this.message}`, errorInfo);
        break;
      case ErrorType.API:
        logger.error(`API Error: ${this.message}`, errorInfo);
        break;
      case ErrorType.CONTRACT:
        logger.error(`Contract Error: ${this.message}`, errorInfo);
        break;
      case ErrorType.VALIDATION:
        logger.warn(`Validation Error: ${this.message}`, errorInfo);
        break;
      default:
        logger.error(`Error: ${this.message}`, errorInfo);
    }
  }
}

/**
 * Creates a network error
 */
export function createNetworkError(
  message: string, 
  context?: Record<string, unknown>,
  originalError?: Error
): HoytError {
  return new HoytError(
    message,
    ErrorType.NETWORK,
    context,
    originalError
  );
}

/**
 * Creates an API error
 */
export function createApiError(
  message: string, 
  context?: Record<string, unknown>,
  originalError?: Error
): HoytError {
  return new HoytError(
    message,
    ErrorType.API,
    context,
    originalError
  );
}

/**
 * Creates a configuration error
 */
export function createConfigError(
  message: string, 
  context?: Record<string, unknown>,
  originalError?: Error
): HoytError {
  return new HoytError(
    message,
    ErrorType.CONFIGURATION,
    context,
    originalError
  );
}

/**
 * Creates a contract interaction error
 */
export function createContractError(
  message: string, 
  context?: Record<string, unknown>,
  originalError?: Error
): HoytError {
  return new HoytError(
    message,
    ErrorType.CONTRACT,
    context,
    originalError
  );
}

/**
 * Global error handler for uncaught exceptions
 */
export function setupGlobalErrorHandlers(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.critical('Uncaught Exception', error);
    // Perform cleanup if needed
    process.exit(1);
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown, _promise: Promise<unknown>) => {
    logger.critical('Unhandled Promise Rejection', reason instanceof Error ? reason : new Error(String(reason)));
  });
}

export default {
  HoytError,
  ErrorType,
  createNetworkError,
  createApiError,
  createConfigError,
  createContractError,
  setupGlobalErrorHandlers
};