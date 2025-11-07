import { setTimeout } from 'timers/promises';
import log from './logger';

export interface RetryOptions {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    backoffFactor: number;
    component: string;
    operation: string;
}

/**
 * Retries an async operation with exponential backoff
 */
export async function retryAsync<T>(
    operation: () => Promise<T>,
    options: RetryOptions
): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt === options.maxAttempts) {
                log.error(`Operation failed after ${options.maxAttempts} attempts`, {
                    component: options.component,
                    operation: options.operation,
                    attempt,
                    maxAttempts: options.maxAttempts,
                    error: lastError.message,
                    status: 'retry_exhausted'
                });
                throw lastError;
            }

            const delay = Math.min(
                options.baseDelay * Math.pow(options.backoffFactor, attempt - 1),
                options.maxDelay
            );

            log.warn(`Operation failed, retrying in ${delay}ms`, {
                component: options.component,
                operation: options.operation,
                attempt,
                maxAttempts: options.maxAttempts,
                delay,
                error: lastError.message,
                status: 'retry_attempt'
            });

            await setTimeout(delay);
        }
    }

    // This should never be reached, but TypeScript requires it
    throw lastError!;
}

/**
 * Retries an async operation with jitter to avoid thundering herd
 */
export async function retryWithJitter<T>(
    operation: () => Promise<T>,
    options: RetryOptions
): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt === options.maxAttempts) {
                log.error(`Operation with jitter failed after ${options.maxAttempts} attempts`, {
                    component: options.component,
                    operation: options.operation,
                    attempt,
                    maxAttempts: options.maxAttempts,
                    error: lastError.message,
                    status: 'retry_jitter_exhausted'
                });
                throw lastError;
            }

            const baseDelay = Math.min(
                options.baseDelay * Math.pow(options.backoffFactor, attempt - 1),
                options.maxDelay
            );

            // Add jitter (±25% of base delay)
            const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
            const delay = Math.max(0, baseDelay + jitter);

            log.warn(`Operation with jitter failed, retrying in ${delay}ms`, {
                component: options.component,
                operation: options.operation,
                attempt,
                maxAttempts: options.maxAttempts,
                delay,
                error: lastError.message,
                status: 'retry_jitter_attempt'
            });

            await setTimeout(delay);
        }
    }

    // This should never be reached, but TypeScript requires it
    throw lastError!;
}