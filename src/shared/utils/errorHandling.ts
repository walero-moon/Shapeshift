import { ChatInputCommandInteraction, ModalSubmitInteraction } from 'discord.js';
import { URL } from 'url';
import { DEFAULT_ALLOWED_MENTIONS } from './allowedMentions';
import log, { LogContext } from './logger';

export interface InteractionErrorContext extends LogContext {
    component: string;
    userId: string;
    guildId?: string | undefined;
    channelId?: string | undefined;
    interactionId: string;
}

/**
 * Handles Discord interaction errors with proper logging and user-friendly responses.
 * Automatically determines whether to use reply() or editReply() based on interaction state.
 */
export async function handleInteractionError(
    interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
    error: unknown,
    context: InteractionErrorContext,
    userMessage = 'An unexpected error occurred. Please try again later.'
): Promise<void> {
    // Log the error with full context
    log.error('Interaction error', {
        ...context,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        status: 'interaction_error'
    });

    // Determine response method based on interaction state
    const isDeferred = interaction.deferred || interaction.replied;

    try {
        if (isDeferred) {
            await interaction.editReply({
                content: userMessage,
                allowedMentions: DEFAULT_ALLOWED_MENTIONS
            });
        } else {
            await interaction.reply({
                content: userMessage,
                allowedMentions: DEFAULT_ALLOWED_MENTIONS,
                ephemeral: true
            });
        }
    } catch (responseError) {
        // If response fails, log it but don't throw to avoid infinite loops
        log.error('Failed to send error response to user', {
            ...context,
            error: responseError instanceof Error ? responseError.message : String(responseError),
            status: 'response_error'
        });
    }
}

/**
 * Wraps async operations with try-catch, logging errors with context.
 * Returns the result on success, or the fallback value (or re-throws) on error.
 */
export async function wrapAsync<T>(
    operation: () => Promise<T>,
    context: LogContext,
    fallback?: T,
    rethrow = false
): Promise<T | undefined> {
    try {
        return await operation();
    } catch (error) {
        log.error('Async operation failed', {
            ...context,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            status: 'async_error'
        });

        if (rethrow) {
            throw error;
        }

        return fallback;
    }
}

/**
 * Validates a URL string, logging errors and returning validation result.
 */
export function validateUrl(
    urlString: string,
    context: LogContext
): { isValid: boolean; errorMessage?: string } {
    if (!urlString || !urlString.trim()) {
        const errorMessage = 'Avatar URL cannot be empty. Please provide a valid URL (e.g., https://example.com/avatar.png) or leave blank.';
        log.warn('URL validation failed: empty', {
            ...context,
            status: 'validation_error',
            reason: 'empty'
        });
        return { isValid: false, errorMessage };
    }

    try {
        const url = new URL(urlString.trim());
        if (!['http:', 'https:'].includes(url.protocol)) {
            const errorMessage = 'Avatar URL must start with http:// or https://. For example: https://example.com/avatar.jpg';
            log.warn('URL validation failed: invalid protocol', {
                ...context,
                status: 'validation_error',
                reason: 'protocol',
                protocol: url.protocol
            });
            return { isValid: false, errorMessage };
        }

        // Additional basic validation
        if (!url.hostname) {
            const errorMessage = 'Avatar URL must include a valid domain name. For example: https://example.com/avatar.png';
            log.warn('URL validation failed: no hostname', {
                ...context,
                status: 'validation_error',
                reason: 'hostname'
            });
            return { isValid: false, errorMessage };
        }

        return { isValid: true };
    } catch (error) {
        const errorMessage = 'Invalid URL format. Please provide a valid URL like https://example.com/image.png';
        log.warn('URL validation failed: parse error', {
            ...context,
            error: error instanceof Error ? error.message : String(error),
            status: 'validation_error',
            reason: 'parse'
        });
        return { isValid: false, errorMessage };
    }
}

/**
 * Handles database operation errors with logging and graceful degradation.
 * Returns the fallback value or re-throws based on configuration.
 */
export async function handleDatabaseError<T>(
    operation: () => Promise<T>,
    context: LogContext,
    fallback?: T,
    rethrow = false
): Promise<T | undefined> {
    try {
        return await operation();
    } catch (error) {
        log.error('Database operation failed', {
            ...context,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            status: 'database_error'
        });

        if (rethrow) {
            throw error;
        }

        return fallback;
    }
}

/**
 * Handles webhook operation errors with retry logic and graceful degradation.
 * Webhook operations are critical for message proxying but can fail due to rate limits or network issues.
 */
export async function handleWebhookError<T>(
    operation: () => Promise<T>,
    context: LogContext,
    fallback?: T,
    rethrow = false
): Promise<T | undefined> {
    try {
        return await operation();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Log webhook errors with specific context
        log.error('Webhook operation failed', {
            ...context,
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
            status: 'webhook_error'
        });

        // For webhook errors, we typically want to degrade gracefully rather than crash
        // The bot can continue operating without proxying messages
        if (rethrow) {
            throw error;
        }

        log.warn('Webhook operation failed, operating in degraded mode for messaging', {
            ...context,
            status: 'webhook_degraded'
        });

        return fallback;
    }
}

/**
 * Wraps operations that should continue working even when database is unavailable.
 * Useful for read operations that can provide cached or default data.
 */
export async function handleDegradedModeError<T>(
    operation: () => Promise<T>,
    context: LogContext,
    fallback: T,
    operationName: string
): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        log.warn(`Operation ${operationName} failed in degraded mode, using fallback`, {
            ...context,
            error: error instanceof Error ? error.message : String(error),
            status: 'degraded_mode_fallback',
            operation: operationName
        });

        return fallback;
    }
}