import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { DrizzleAutoproxyRepo } from '../infra/AutoproxyRepo';
import { db } from '../../../shared/db/client';
import { autoproxyStates } from '../../../shared/db/schema';
import { log } from '../../../shared/utils/logger';
import { eq } from 'drizzle-orm';

type MockedDb = {
    insert: MockedFunction<any>;
    select: MockedFunction<any>;
    update: MockedFunction<any>;
    delete: MockedFunction<any>;
};

// Mock the dependencies directly
vi.mock('../../../shared/db/client', () => ({
    db: {
        insert: vi.fn(),
        select: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    }
}));

vi.mock('../../../shared/db/schema', () => ({
    autoproxyStates: {
        id: {},
        userId: {},
        guildId: {},
        channelId: {},
        mode: {},
        formId: {},
        lastFormId: {},
        expiresAt: {},
        createdAt: {},
        updatedAt: {}
    },
    forms: {
        id: {}
    }
}));

vi.mock('../../../shared/utils/logger', () => ({
    log: {
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

vi.mock('drizzle-orm', () => ({
    eq: vi.fn(() => ({})),
    and: vi.fn(() => ({})),
    or: vi.fn(() => ({})),
    isNull: vi.fn(() => ({})),
    isNotNull: vi.fn(() => ({})),
    notInArray: vi.fn(() => ({})),
    sql: vi.fn(() => ({})),
}));

describe('AutoproxyRepo', () => {
    let autoproxyRepo: DrizzleAutoproxyRepo;
    let mockDb: MockedDb;

    beforeEach(() => {
        vi.clearAllMocks();
        autoproxyRepo = new DrizzleAutoproxyRepo();

        // Get references to mocked functions
        mockDb = db as unknown as MockedDb;
    });

    describe('upsertState', () => {
        it('should successfully upsert an autoproxy state', async () => {
            const mockState = {
                id: 'state-1',
                userId: 'user1',
                guildId: 'guild1',
                channelId: null,
                mode: 'form' as const,
                formId: 'form1',
                lastFormId: null,
                expiresAt: null,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            mockDb.insert.mockReturnValue({
                values: vi.fn().mockReturnValue({
                    onConflictDoUpdate: vi.fn().mockReturnValue({
                        returning: vi.fn().mockResolvedValue([mockState]),
                    }),
                }),
            });

            const result = await autoproxyRepo.upsertState({
                userId: 'user1',
                guildId: 'guild1',
                mode: 'form',
                formId: 'form1'
            });

            expect(result).toEqual(mockState);
        });

        it('should handle upsert returning no result', async () => {
            mockDb.insert.mockReturnValue({
                values: vi.fn().mockReturnValue({
                    onConflictDoUpdate: vi.fn().mockReturnValue({
                        returning: vi.fn().mockResolvedValue([]),
                    }),
                }),
            });

            await expect(autoproxyRepo.upsertState({
                userId: 'user1',
                mode: 'form',
                formId: 'form1'
            })).rejects.toThrow('Failed to upsert autoproxy state');
        });
    });

    describe('getState', () => {
        it('should return channel-scoped state when available', async () => {
            const mockState = {
                id: 'state-1',
                userId: 'user1',
                guildId: 'guild1',
                channelId: 'channel1',
                mode: 'form' as const,
                formId: 'form1',
                lastFormId: null,
                expiresAt: null,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const limitFn = vi.fn().mockResolvedValue([mockState]);
            const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
            const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: whereFn,
                }),
            });

            const result = await autoproxyRepo.getState('user1', 'guild1', 'channel1');

            expect(result).toEqual(mockState);
        });

        it('should return null when no state is found', async () => {
            const limitFn = vi.fn().mockResolvedValue([]);
            const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
            const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: whereFn,
                }),
            });

            const result = await autoproxyRepo.getState('user1', 'guild1', 'channel1');

            expect(result).toBeNull();
        });
    });

    describe('clearState', () => {
        it('should successfully clear a specific state', async () => {
            mockDb.delete.mockReturnValue({
                where: vi.fn().mockResolvedValue(undefined),
            });

            await autoproxyRepo.clearState('user1', 'guild1', 'channel1');

            expect(mockDb.delete).toHaveBeenCalledWith(autoproxyStates);
        });
    });

    describe('clearAll', () => {
        it('should successfully clear all states for a user', async () => {
            mockDb.delete.mockReturnValue({
                where: vi.fn().mockResolvedValue(undefined),
            });

            await autoproxyRepo.clearAll('user1');

            expect(mockDb.delete).toHaveBeenCalledWith(autoproxyStates);
            expect(eq).toHaveBeenCalledWith(autoproxyStates.userId, 'user1');
        });
    });

    describe('recordLatch', () => {
        it('should successfully record latch form', async () => {
            mockDb.update.mockReturnValue({
                set: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue(undefined),
                }),
            });

            await autoproxyRepo.recordLatch('user1', 'guild1', 'channel1', 'form1');

            expect(mockDb.update).toHaveBeenCalledWith(autoproxyStates);
        });
    });

    describe('deleteMissingForm', () => {
        it('should successfully delete states with missing forms', async () => {
            mockDb.delete.mockReturnValue({
                where: vi.fn().mockResolvedValue(undefined),
            });

            await autoproxyRepo.deleteMissingForm();

            expect(mockDb.delete).toHaveBeenCalledWith(autoproxyStates);
        });
    });

    describe('error handling', () => {
        it('should log errors during upsertState', async () => {
            const mockLog = vi.fn();
            vi.mocked(log.error).mockImplementation(mockLog);

            mockDb.insert.mockReturnValue({
                values: vi.fn().mockReturnValue({
                    onConflictDoUpdate: vi.fn().mockReturnValue({
                        returning: vi.fn().mockRejectedValue(new Error('Database error')),
                    }),
                }),
            });

            await expect(autoproxyRepo.upsertState({
                userId: 'user1',
                mode: 'form',
                formId: 'form1'
            })).rejects.toThrow();

            expect(mockLog).toHaveBeenCalledWith(
                'Failed to upsert autoproxy state',
                expect.objectContaining({
                    component: 'proxy',
                    userId: 'user1',
                    status: 'database_error',
                    error: expect.any(Error)
                })
            );
        });

        it('should log errors during getState', async () => {
            const mockLog = vi.fn();
            vi.mocked(log.error).mockImplementation(mockLog);

            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockRejectedValue(new Error('Query error')),
                }),
            });

            await expect(autoproxyRepo.getState('user1')).rejects.toThrow();

            expect(mockLog).toHaveBeenCalledWith(
                'Failed to get autoproxy state',
                expect.objectContaining({
                    component: 'proxy',
                    userId: 'user1',
                    status: 'database_error',
                    error: expect.any(Error)
                })
            );
        });
    });
});
