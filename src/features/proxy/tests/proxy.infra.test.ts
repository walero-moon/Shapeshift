import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { DrizzleProxiedMessageRepo } from '../infra/ProxiedMessageRepo';
import { db } from '../../../shared/db/client';
import { proxiedMessages } from '../../../shared/db/schema';
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
    proxiedMessages: {
        id: {},
        userId: {},
        formId: {},
        guildId: {},
        channelId: {},
        webhookId: {},
        webhookToken: {},
        messageId: {},
        sourceMessageId: {},
        createdAt: {}
    },
}));

vi.mock('../../../shared/utils/logger', () => ({
    log: {
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

vi.mock('drizzle-orm', () => ({
    eq: vi.fn(() => ({})),
}));

describe('ProxiedMessageRepo', () => {
    let proxiedMessageRepo: DrizzleProxiedMessageRepo;
    let mockDb: MockedDb;

    beforeEach(() => {
        vi.clearAllMocks();
        proxiedMessageRepo = new DrizzleProxiedMessageRepo();

        // Get references to mocked functions
        mockDb = db as unknown as MockedDb;
    });

    describe('insert', () => {
        it('should successfully insert a proxied message', async () => {
            const mockProxiedMessage = {
                id: 'message-1',
                userId: 'user1',
                formId: 'form1',
                guildId: 'guild1',
                channelId: 'channel1',
                webhookId: 'webhook1',
                webhookToken: 'token1',
                messageId: 'msg1',
                sourceMessageId: 'source1',
                createdAt: new Date()
            };

            mockDb.insert.mockReturnValue({
                values: vi.fn().mockReturnValue({
                    returning: vi.fn().mockResolvedValue([mockProxiedMessage]),
                }),
            });

            const result = await proxiedMessageRepo.insert({
                userId: 'user1',
                formId: 'form1',
                guildId: 'guild1',
                channelId: 'channel1',
                webhookId: 'webhook1',
                webhookToken: 'token1',
                messageId: 'msg1',
                sourceMessageId: 'source1'
            });

            expect(result).toEqual(mockProxiedMessage);
        });

        it('should handle database errors during insert', async () => {
            const mockReturning = vi.fn().mockRejectedValue(new Error('Database connection failed'));
            mockDb.insert.mockReturnValue({
                values: vi.fn().mockReturnValue({
                    returning: mockReturning,
                }),
            });

            await expect(proxiedMessageRepo.insert({
                userId: 'user1',
                formId: 'form1',
                guildId: 'guild1',
                channelId: 'channel1',
                webhookId: 'webhook1',
                webhookToken: 'token1',
                messageId: 'msg1'
            })).rejects.toThrow('Database connection failed');
        });

        it('should handle insert returning no result', async () => {
            mockDb.insert.mockReturnValue({
                values: vi.fn().mockReturnValue({
                    returning: vi.fn().mockResolvedValue([]),
                }),
            });

            await expect(proxiedMessageRepo.insert({
                userId: 'user1',
                formId: 'form1',
                guildId: 'guild1',
                channelId: 'channel1',
                webhookId: 'webhook1',
                webhookToken: 'token1',
                messageId: 'msg1'
            })).rejects.toThrow('Failed to insert proxied message');
        });
    });

    describe('getByWebhookMessageId', () => {
        it('should successfully find a proxied message by webhook message ID', async () => {
            const mockProxiedMessage = {
                id: 'message-1',
                userId: 'user1',
                formId: 'form1',
                guildId: 'guild1',
                channelId: 'channel1',
                webhookId: 'webhook1',
                webhookToken: 'token1',
                messageId: 'msg1',
                sourceMessageId: 'source1',
                createdAt: new Date()
            };

            const limitFn = vi.fn().mockResolvedValue([mockProxiedMessage]);
            const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: whereFn,
                }),
            });

            const result = await proxiedMessageRepo.getByWebhookMessageId('msg1');

            expect(result).toEqual(mockProxiedMessage);
            expect(eq).toHaveBeenCalledWith(proxiedMessages.messageId, 'msg1');
            expect(limitFn).toHaveBeenCalledWith(1);
        });

        it('should return null when no proxied message is found', async () => {
            const limitFn = vi.fn().mockResolvedValue([]);
            const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: whereFn,
                }),
            });

            const result = await proxiedMessageRepo.getByWebhookMessageId('nonexistent');

            expect(result).toBeNull();
        });

        it('should handle database errors during lookup', async () => {
            const whereFn = vi.fn().mockImplementation(() => {
                throw new Error('Query failed');
            });
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: whereFn,
                }),
            });

            await expect(proxiedMessageRepo.getByWebhookMessageId('msg1')).rejects.toThrow('Query failed');
        });
    });

    describe('getBySourceMessageId', () => {
        it('should successfully find a proxied message by source message ID', async () => {
            const mockProxiedMessage = {
                id: 'message-1',
                userId: 'user1',
                formId: 'form1',
                guildId: 'guild1',
                channelId: 'channel1',
                webhookId: 'webhook1',
                webhookToken: 'token1',
                messageId: 'msg1',
                sourceMessageId: 'source1',
                createdAt: new Date()
            };

            const limitFn = vi.fn().mockResolvedValue([mockProxiedMessage]);
            const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: whereFn,
                }),
            });

            const result = await proxiedMessageRepo.getBySourceMessageId('source1');

            expect(result).toEqual(mockProxiedMessage);
            expect(eq).toHaveBeenCalledWith(proxiedMessages.sourceMessageId, 'source1');
        });

        it('should return null when no proxied message is found by source message ID', async () => {
            const limitFn = vi.fn().mockResolvedValue([]);
            const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: whereFn,
                }),
            });

            const result = await proxiedMessageRepo.getBySourceMessageId('nonexistent');

            expect(result).toBeNull();
        });

        it('should handle database errors during source message lookup', async () => {
            const whereFn = vi.fn().mockImplementation(() => {
                throw new Error('Query failed');
            });
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: whereFn,
                }),
            });

            await expect(proxiedMessageRepo.getBySourceMessageId('source1')).rejects.toThrow('Query failed');
        });
    });

    describe('deleteById', () => {
        it('should successfully delete a proxied message by ID', async () => {
            mockDb.delete.mockReturnValue({
                where: vi.fn().mockResolvedValue(undefined),
            });

            await proxiedMessageRepo.deleteById('message-1');

            expect(mockDb.delete).toHaveBeenCalledWith(proxiedMessages);
            expect(eq).toHaveBeenCalledWith(proxiedMessages.id, 'message-1');
        });

        it('should handle database errors during deletion', async () => {
            mockDb.delete.mockReturnValue({
                where: vi.fn().mockRejectedValue(new Error('Deletion failed')),
            });

            await expect(proxiedMessageRepo.deleteById('message-1')).rejects.toThrow('Deletion failed');
        });
    });

    describe('error logging', () => {
        it('should log errors with proper context during insert', async () => {
            const mockLog = vi.fn();
            vi.mocked(log.error).mockImplementation(mockLog);

            mockDb.insert.mockReturnValue({
                values: vi.fn().mockReturnValue({
                    returning: vi.fn().mockRejectedValue(new Error('Database error')),
                }),
            });

            await expect(proxiedMessageRepo.insert({
                userId: 'user1',
                formId: 'form1',
                guildId: 'guild1',
                channelId: 'channel1',
                webhookId: 'webhook1',
                webhookToken: 'token1',
                messageId: 'msg1'
            })).rejects.toThrow();

            expect(mockLog).toHaveBeenCalledWith(
                'Failed to insert proxied message',
                expect.objectContaining({
                    component: 'proxy',
                    userId: 'user1',
                    status: 'database_error',
                    error: expect.any(Error)
                })
            );
        });

        it('should log errors with proper context during getByWebhookMessageId', async () => {
            const mockLog = vi.fn();
            vi.mocked(log.error).mockImplementation(mockLog);

            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockRejectedValue(new Error('Query error')),
                    limit: vi.fn(),
                }),
            });

            await expect(proxiedMessageRepo.getByWebhookMessageId('msg1')).rejects.toThrow();

            expect(mockLog).toHaveBeenCalledWith(
                'Failed to get proxied message by webhook message ID',
                expect.objectContaining({
                    component: 'proxy',
                    messageId: 'msg1',
                    status: 'database_error',
                    error: expect.any(Error)
                })
            );
        });

        it('should log errors with proper context during getBySourceMessageId', async () => {
            const mockLog = vi.fn();
            vi.mocked(log.error).mockImplementation(mockLog);

            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockRejectedValue(new Error('Query error')),
                    limit: vi.fn(),
                }),
            });

            await expect(proxiedMessageRepo.getBySourceMessageId('source1')).rejects.toThrow();

            expect(mockLog).toHaveBeenCalledWith(
                'Failed to get proxied message by source message ID',
                expect.objectContaining({
                    component: 'proxy',
                    sourceMessageId: 'source1',
                    status: 'database_error',
                    error: expect.any(Error)
                })
            );
        });

        it('should log errors with proper context during deleteById', async () => {
            const mockLog = vi.fn();
            vi.mocked(log.error).mockImplementation(mockLog);

            mockDb.delete.mockReturnValue({
                where: vi.fn().mockRejectedValue(new Error('Deletion error')),
            });

            await expect(proxiedMessageRepo.deleteById('message-1')).rejects.toThrow();

            expect(mockLog).toHaveBeenCalledWith(
                'Failed to delete proxied message',
                expect.objectContaining({
                    component: 'proxy',
                    id: 'message-1',
                    status: 'database_error',
                    error: expect.any(Error)
                })
            );
        });
    });
});
