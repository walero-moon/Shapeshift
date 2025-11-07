import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    handleInteractionError,
    wrapAsync,
    validateUrl,
    handleDatabaseError,
    handleWebhookError,
    handleDegradedModeError
} from '../errorHandling';
import log from '../logger';

// Mock logger
vi.mock('../logger', () => ({
    default: {
        error: vi.fn(),
        warn: vi.fn(),
    },
}));

describe('handleInteractionError', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle deferred interactions correctly', async () => {
        const mockInteraction = {
            deferred: true,
            replied: false,
            editReply: vi.fn().mockResolvedValue(undefined),
        };

        await handleInteractionError(mockInteraction as any, new Error('Test error'), {
            component: 'test',
            userId: 'user1',
            interactionId: 'int1'
        });

        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: 'An unexpected error occurred. Please try again later.',
            allowedMentions: { parse: [], repliedUser: false }
        });
        expect(log.error).toHaveBeenCalled();
    });

    it('should handle replied interactions correctly', async () => {
        const mockInteraction = {
            deferred: false,
            replied: true,
            editReply: vi.fn().mockResolvedValue(undefined),
        };

        await handleInteractionError(mockInteraction as any, new Error('Test error'), {
            component: 'test',
            userId: 'user1',
            interactionId: 'int1'
        });

        expect(mockInteraction.editReply).toHaveBeenCalledWith({
            content: 'An unexpected error occurred. Please try again later.',
            allowedMentions: { parse: [], repliedUser: false }
        });
    });

    it('should handle fresh interactions correctly', async () => {
        const mockInteraction = {
            deferred: false,
            replied: false,
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await handleInteractionError(mockInteraction as any, new Error('Test error'), {
            component: 'test',
            userId: 'user1',
            interactionId: 'int1'
        });

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: 'An unexpected error occurred. Please try again later.',
            allowedMentions: { parse: [], repliedUser: false },
            ephemeral: true
        });
    });

    it('should handle custom error messages', async () => {
        const mockInteraction = {
            deferred: false,
            replied: false,
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await handleInteractionError(mockInteraction as any, new Error('Test error'), {
            component: 'test',
            userId: 'user1',
            interactionId: 'int1'
        }, 'Custom error message');

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: 'Custom error message',
            allowedMentions: { parse: [], repliedUser: false },
            ephemeral: true
        });
    });

    it('should handle response errors gracefully', async () => {
        const mockInteraction = {
            deferred: false,
            replied: false,
            reply: vi.fn().mockRejectedValue(new Error('Response failed')),
        };

        await expect(handleInteractionError(mockInteraction as any, new Error('Test error'), {
            component: 'test',
            userId: 'user1',
            interactionId: 'int1'
        })).resolves.toBeUndefined();

        expect(log.error).toHaveBeenCalledTimes(2); // Original error + response error
    });
});

describe('wrapAsync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return successful operation result', async () => {
        const operation = vi.fn().mockResolvedValue('success');

        const result = await wrapAsync(operation, { component: 'test' });

        expect(result).toBe('success');
        expect(log.error).not.toHaveBeenCalled();
    });

    it('should return fallback on error when rethrow is false', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));

        const result = await wrapAsync(operation, { component: 'test' }, 'fallback');

        expect(result).toBe('fallback');
        expect(log.error).toHaveBeenCalled();
    });

    it('should rethrow error when rethrow is true', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));

        await expect(wrapAsync(operation, { component: 'test' }, undefined, true)).rejects.toThrow('Operation failed');
        expect(log.error).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
        const operation = vi.fn().mockRejectedValue('string error');

        const result = await wrapAsync(operation, { component: 'test' }, 'fallback');

        expect(result).toBe('fallback');
        expect(log.error).toHaveBeenCalledWith('Async operation failed', expect.objectContaining({
            error: 'string error'
        }));
    });
});

describe('validateUrl', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should validate valid HTTP URLs', () => {
        const result = validateUrl('https://example.com/image.png', { component: 'test' });

        expect(result.isValid).toBe(true);
        expect(result.errorMessage).toBeUndefined();
        expect(log.warn).not.toHaveBeenCalled();
    });

    it('should validate valid HTTPS URLs', () => {
        const result = validateUrl('http://example.com/image.jpg', { component: 'test' });

        expect(result.isValid).toBe(true);
        expect(log.warn).not.toHaveBeenCalled();
    });

    it('should reject empty URLs', () => {
        const result = validateUrl('', { component: 'test' });

        expect(result.isValid).toBe(false);
        expect(result.errorMessage).toContain('Avatar URL cannot be empty');
        expect(log.warn).toHaveBeenCalledWith('URL validation failed: empty', expect.any(Object));
    });

    it('should reject whitespace-only URLs', () => {
        const result = validateUrl('   ', { component: 'test' });

        expect(result.isValid).toBe(false);
        expect(result.errorMessage).toContain('Avatar URL cannot be empty');
    });

    it('should reject invalid protocols', () => {
        const result = validateUrl('ftp://example.com/image.png', { component: 'test' });

        expect(result.isValid).toBe(false);
        expect(result.errorMessage).toContain('Avatar URL must start with http:// or https://');
        expect(log.warn).toHaveBeenCalledWith('URL validation failed: invalid protocol', expect.any(Object));
    });

    it('should reject malformed URLs', () => {
        const result = validateUrl('not-a-url', { component: 'test' });

        expect(result.isValid).toBe(false);
        expect(result.errorMessage).toContain('Invalid URL format');
        expect(log.warn).toHaveBeenCalledWith('URL validation failed: parse error', expect.any(Object));
    });

    it('should reject URLs without hostname', () => {
        const result = validateUrl('https://', { component: 'test' });

        expect(result.isValid).toBe(false);
        expect(result.errorMessage).toContain('Avatar URL must include a valid domain name');
        expect(log.warn).toHaveBeenCalledWith('URL validation failed: no hostname', expect.any(Object));
    });
});

describe('handleDatabaseError', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return successful operation result', async () => {
        const operation = vi.fn().mockResolvedValue('success');

        const result = await handleDatabaseError(operation, { component: 'test' });

        expect(result).toBe('success');
        expect(log.error).not.toHaveBeenCalled();
    });

    it('should return fallback on error when rethrow is false', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('DB error'));

        const result = await handleDatabaseError(operation, { component: 'test' }, 'fallback');

        expect(result).toBe('fallback');
        expect(log.error).toHaveBeenCalledWith('Database operation failed', expect.objectContaining({
            error: 'DB error',
            status: 'database_error'
        }));
    });

    it('should rethrow error when rethrow is true', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('DB error'));

        await expect(handleDatabaseError(operation, { component: 'test' }, undefined, true)).rejects.toThrow('DB error');
        expect(log.error).toHaveBeenCalled();
    });
});

describe('handleWebhookError', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return successful operation result', async () => {
        const operation = vi.fn().mockResolvedValue('success');

        const result = await handleWebhookError(operation, { component: 'test' });

        expect(result).toBe('success');
        expect(log.error).not.toHaveBeenCalled();
    });

    it('should return fallback on error when rethrow is false', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Webhook failed'));

        const result = await handleWebhookError(operation, { component: 'test' }, 'fallback');

        expect(result).toBe('fallback');
        expect(log.error).toHaveBeenCalledWith('Webhook operation failed', expect.objectContaining({
            error: 'Webhook failed',
            status: 'webhook_error'
        }));
        expect(log.warn).toHaveBeenCalledWith('Webhook operation failed, operating in degraded mode for messaging', expect.any(Object));
    });

    it('should rethrow error when rethrow is true', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Webhook failed'));

        await expect(handleWebhookError(operation, { component: 'test' }, undefined, true)).rejects.toThrow('Webhook failed');
        expect(log.warn).not.toHaveBeenCalled();
    });
});

describe('handleDegradedModeError', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return successful operation result', async () => {
        const operation = vi.fn().mockResolvedValue('success');

        const result = await handleDegradedModeError(operation, { component: 'test' }, 'fallback', 'test operation');

        expect(result).toBe('success');
        expect(log.warn).not.toHaveBeenCalled();
    });

    it('should return fallback on error', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));

        const result = await handleDegradedModeError(operation, { component: 'test' }, 'fallback', 'test operation');

        expect(result).toBe('fallback');
        expect(log.warn).toHaveBeenCalledWith('Operation test operation failed in degraded mode, using fallback', expect.objectContaining({
            error: 'Operation failed',
            status: 'degraded_mode_fallback',
            operation: 'test operation'
        }));
    });
});