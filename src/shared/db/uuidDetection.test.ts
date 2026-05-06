import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
    db: {
        execute: vi.fn(),
    },
}));

vi.mock('uuid', () => ({
    v7: vi.fn(() => 'app-generated-uuid'),
}));

vi.mock('../utils/logger', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

import { db } from './client';
import log from '../utils/logger';
import {
    generateUuidv7,
    generateUuidv7OrUndefined,
    isDatabaseUuidv7Supported,
    resetUuidv7Detection,
} from './uuidDetection';

describe('uuidDetection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetUuidv7Detection();
    });

    it('uses database UUIDv7 when available', async () => {
        vi.mocked(db.execute)
            .mockResolvedValueOnce({ rows: [{ uuidv7: 'probe' }] } as never)
            .mockResolvedValueOnce({ rows: [{ id: 'db-generated-uuid' }] } as never);

        await expect(isDatabaseUuidv7Supported()).resolves.toBe(true);
        await expect(generateUuidv7()).resolves.toBe('db-generated-uuid');
        expect(db.execute).toHaveBeenCalledTimes(2);
    });

    it('falls back to application UUID when database function is unavailable', async () => {
        vi.mocked(db.execute).mockRejectedValueOnce(new Error('function uuidv7 does not exist'));

        await expect(generateUuidv7()).resolves.toBe('app-generated-uuid');
        await expect(generateUuidv7OrUndefined()).resolves.toBe('app-generated-uuid');
        expect(log.info).toHaveBeenCalledWith(
            'UUIDv7 function not available in database, will use application fallback',
            expect.objectContaining({ component: 'uuid-detection', status: 'fallback' })
        );
        expect(db.execute).toHaveBeenCalledTimes(1);
    });

    it('lets database generate IDs when UUIDv7 is supported', async () => {
        vi.mocked(db.execute).mockResolvedValueOnce({ rows: [{}] } as never);

        await expect(generateUuidv7OrUndefined()).resolves.toBeUndefined();
    });

    it('falls back when database generation fails after positive detection', async () => {
        vi.mocked(db.execute)
            .mockResolvedValueOnce({ rows: [{}] } as never)
            .mockRejectedValue(new Error('temporary failure'));

        await expect(generateUuidv7()).resolves.toBe('app-generated-uuid');
        expect(log.warn).toHaveBeenCalledWith(
            'Database UUIDv7 generation failed, falling back to application generation',
            expect.objectContaining({ component: 'uuid-detection', status: 'fallback' })
        );
    });
});
