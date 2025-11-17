import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteProxiedMessage } from '../app/DeleteProxiedMessage';

vi.mock('../../../shared/utils/logger', () => {
    const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        child: vi.fn().mockReturnThis()
    };
    return {
        log: mockLogger,
        default: mockLogger
    };
});

describe('deleteProxiedMessage', () => {
    const record = {
        id: 'record-1',
        userId: 'user-123',
        formId: 'form-456',
        guildId: 'guild-789',
        channelId: 'channel-111',
        webhookId: 'webhook-222',
        webhookToken: 'token-333',
        messageId: 'message-444',
        sourceMessageId: 'source-555',
        createdAt: new Date()
    };

    const mockChannelProxy = {
        send: vi.fn(),
        edit: vi.fn(),
        delete: vi.fn()
    };

    const mockRepo = {
        deleteById: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('deletes proxied message when user owns it', async () => {
        await deleteProxiedMessage({ record, userId: 'user-123' }, mockChannelProxy as any, mockRepo as any);

        expect(mockChannelProxy.delete).toHaveBeenCalledWith('webhook-222', 'token-333', 'message-444');
        expect(mockRepo.deleteById).toHaveBeenCalledWith('record-1');
    });

    it('throws when user does not own the message', async () => {
        await expect(deleteProxiedMessage(
            { record: { ...record, userId: 'another' }, userId: 'user-123' },
            mockChannelProxy as any,
            mockRepo as any
        )).rejects.toThrow('You can only delete messages you proxied.');

        expect(mockChannelProxy.delete).not.toHaveBeenCalled();
        expect(mockRepo.deleteById).not.toHaveBeenCalled();
    });
});
