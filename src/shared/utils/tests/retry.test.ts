import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { retryAsync, retryWithJitter } from '../retry';
import log from '../logger';

// Mock logger
vi.mock('../logger', () => ({
    default: {
        error: vi.fn(),
        warn: vi.fn(),
    },
}));

// Mock timers/promises setTimeout
vi.mock('timers/promises', () => ({
    setTimeout: vi.fn(),
}));

describe('retryAsync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    it('should return result on first successful attempt', async () => {
        const operation = vi.fn().mockResolvedValue('success');

        const result = await retryAsync(operation, {
            maxAttempts: 3,
            baseDelay: 100,
            maxDelay: 1000,
            backoffFactor: 2,
            component: 'test',
            operation: 'test-op'
        });

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(1);
        expect(log.error).not.toHaveBeenCalled();
        expect(log.warn).not.toHaveBeenCalled();
    });

    it('should retry on failure and succeed on second attempt', async () => {
        const operation = vi.fn()
            .mockRejectedValueOnce(new Error('First failure'))
            .mockResolvedValueOnce('success');

        const result = await retryAsync(operation, {
            maxAttempts: 3,
            baseDelay: 100,
            maxDelay: 1000,
            backoffFactor: 2,
            component: 'test',
            operation: 'test-op'
        });

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(2);
        expect(log.warn).toHaveBeenCalledTimes(1);
        expect(log.error).not.toHaveBeenCalled();
    });

    it('should exhaust retries and throw last error', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Persistent failure'));

        await expect(retryAsync(operation, {
            maxAttempts: 3,
            baseDelay: 100,
            maxDelay: 1000,
            backoffFactor: 2,
            component: 'test',
            operation: 'test-op'
        })).rejects.toThrow('Persistent failure');

        expect(operation).toHaveBeenCalledTimes(3);
        expect(log.warn).toHaveBeenCalledTimes(2);
        expect(log.error).toHaveBeenCalledTimes(1);
    });

    it('should respect maxDelay limit', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Failure'));
        const setTimeoutSpy = vi.fn();
        (vi.mocked(await import('timers/promises')).setTimeout as unknown) = setTimeoutSpy;

        await expect(retryAsync(operation, {
            maxAttempts: 5,
            baseDelay: 100,
            maxDelay: 200,
            backoffFactor: 3,
            component: 'test',
            operation: 'test-op'
        })).rejects.toThrow('Failure');

        // Check that delays don't exceed maxDelay
        const calls = setTimeoutSpy.mock.calls;
        expect(calls[0]?.[0]).toBe(100); // baseDelay
        expect(calls[1]?.[0]).toBe(200); // min(baseDelay * backoffFactor, maxDelay) = min(300, 200) = 200
        expect(calls[2]?.[0]).toBe(200); // min(600, 200) = 200
        expect(calls[3]?.[0]).toBe(200); // min(1800, 200) = 200
    });

    it('should use correct delay calculation', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Failure'));
        const setTimeoutSpy = vi.fn();
        (vi.mocked(await import('timers/promises')).setTimeout as unknown) = setTimeoutSpy;

        await expect(retryAsync(operation, {
            maxAttempts: 3,
            baseDelay: 100,
            maxDelay: 1000,
            backoffFactor: 2,
            component: 'test',
            operation: 'test-op'
        })).rejects.toThrow('Failure');

        // Check that delays are calculated correctly
        const calls = setTimeoutSpy.mock.calls;
        expect(calls[0]?.[0]).toBe(100); // baseDelay
        expect(calls[1]?.[0]).toBe(200); // baseDelay * backoffFactor^1
    });

    it('should handle non-Error exceptions', async () => {
        const operation = vi.fn().mockRejectedValue('string error');

        await expect(retryAsync(operation, {
            maxAttempts: 2,
            baseDelay: 100,
            maxDelay: 1000,
            backoffFactor: 2,
            component: 'test',
            operation: 'test-op'
        })).rejects.toThrow('string error');

        expect(log.error).toHaveBeenCalledWith(
            'Operation failed after 2 attempts',
            expect.objectContaining({
                error: 'string error'
            })
        );
    });
});

describe('retryWithJitter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    it('should return result on first successful attempt', async () => {
        const operation = vi.fn().mockResolvedValue('success');

        const result = await retryWithJitter(operation, {
            maxAttempts: 3,
            baseDelay: 100,
            maxDelay: 1000,
            backoffFactor: 2,
            component: 'test',
            operation: 'test-op'
        });

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(1);
        expect(log.error).not.toHaveBeenCalled();
        expect(log.warn).not.toHaveBeenCalled();
    });

    it('should retry with jitter on failure', async () => {
        const operation = vi.fn()
            .mockRejectedValueOnce(new Error('First failure'))
            .mockResolvedValueOnce('success');

        const result = await retryWithJitter(operation, {
            maxAttempts: 3,
            baseDelay: 100,
            maxDelay: 1000,
            backoffFactor: 2,
            component: 'test',
            operation: 'test-op'
        });

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(2);
        expect(log.warn).toHaveBeenCalledTimes(1);
        expect(log.error).not.toHaveBeenCalled();
    });

    it('should exhaust retries with jitter and throw last error', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Persistent failure'));

        await expect(retryWithJitter(operation, {
            maxAttempts: 3,
            baseDelay: 100,
            maxDelay: 1000,
            backoffFactor: 2,
            component: 'test',
            operation: 'test-op'
        })).rejects.toThrow('Persistent failure');

        expect(operation).toHaveBeenCalledTimes(3);
        expect(log.warn).toHaveBeenCalledTimes(2);
        expect(log.error).toHaveBeenCalledTimes(1);
    });

    it('should apply jitter within expected range', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Failure'));
        const setTimeoutSpy = vi.fn();
        (vi.mocked(await import('timers/promises')).setTimeout as unknown) = setTimeoutSpy;

        // Mock Math.random to return 0.5 for predictable jitter
        const originalRandom = Math.random;
        Math.random = vi.fn().mockReturnValue(0.5);

        await expect(retryWithJitter(operation, {
            maxAttempts: 3,
            baseDelay: 100,
            maxDelay: 1000,
            backoffFactor: 2,
            component: 'test',
            operation: 'test-op'
        })).rejects.toThrow('Failure');

        // With random = 0.5, jitter = baseDelay * 0.25 * (0.5 * 2 - 1) = 100 * 0.25 * 0 = 0
        // So delay should be max(0, 100 + 0) = 100
        expect(setTimeoutSpy.mock.calls[0]?.[0]).toBe(100);

        Math.random = originalRandom;
    });

    it('should ensure delay is never negative', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('Failure'));
        const setTimeoutSpy = vi.fn();
        (vi.mocked(await import('timers/promises')).setTimeout as unknown) = setTimeoutSpy;

        // Mock Math.random to return 0 (minimum jitter)
        const originalRandom = Math.random;
        Math.random = vi.fn().mockReturnValue(0);

        await expect(retryWithJitter(operation, {
            maxAttempts: 3,
            baseDelay: 100,
            maxDelay: 1000,
            backoffFactor: 2,
            component: 'test',
            operation: 'test-op'
        })).rejects.toThrow('Failure');

        // With random = 0, jitter = 100 * 0.25 * (0 * 2 - 1) = 100 * 0.25 * (-1) = -25
        // So delay should be max(0, 100 + (-25)) = 75
        expect(setTimeoutSpy.mock.calls[0]?.[0]).toBe(75);

        Math.random = originalRandom;
    });
});