import { describe, it, expect, vi, beforeEach } from 'vitest';
import { editProxiedMessage } from '../app/EditProxiedMessage';
import { reuploadAttachments } from '../../../shared/utils/attachments';
import { DEFAULT_ALLOWED_MENTIONS } from '../../../shared/utils/allowedMentions';

vi.mock('../../../shared/utils/attachments', () => ({
    reuploadAttachments: vi.fn()
}));

vi.mock('../../../shared/utils/logger', () => ({
    log: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn()
    }
}));

describe('editProxiedMessage', () => {
    const mockRecord = {
        id: 'record-1',
        userId: 'user-123',
        formId: 'form-456',
        guildId: 'guild-999',
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

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(reuploadAttachments).mockResolvedValue([]);
    });

    it('edits a proxied message when user owns it and no attachments', async () => {
        await editProxiedMessage(
            {
                record: mockRecord,
                userId: 'user-123',
                content: 'Updated content'
            },
            mockChannelProxy as any
        );

        expect(mockChannelProxy.edit).toHaveBeenCalledWith(
            'webhook-222',
            'token-333',
            'message-444',
            {
                content: 'Updated content',
                attachments: undefined,
                allowedMentions: DEFAULT_ALLOWED_MENTIONS
            }
        );
    });

    it('reuploads attachments when message has them', async () => {
        const reuploadedBuffer = Buffer.from('test');
        const attachmentBuffers = [{ name: 'file.png', data: reuploadedBuffer }];
        vi.mocked(reuploadAttachments).mockResolvedValue(attachmentBuffers as any);

        await editProxiedMessage(
            {
                record: mockRecord,
                userId: 'user-123',
                content: 'Updated content',
                attachments: [
                    { id: 'att-1', url: 'https://cdn.discordapp.com/file.png', name: 'file.png', size: 1024 }
                ]
            },
            mockChannelProxy as any
        );

        expect(reuploadAttachments).toHaveBeenCalledWith([
            { id: 'att-1', url: 'https://cdn.discordapp.com/file.png', name: 'file.png', size: 1024 }
        ]);

        expect(mockChannelProxy.edit).toHaveBeenCalledWith(
            'webhook-222',
            'token-333',
            'message-444',
            {
                content: 'Updated content',
                attachments: [
                    {
                        name: 'file.png',
                        data: reuploadedBuffer
                    }
                ],
                allowedMentions: DEFAULT_ALLOWED_MENTIONS
            }
        );
    });

    it('throws when user does not own the message', async () => {
        await expect(editProxiedMessage(
            {
                record: { ...mockRecord, userId: 'different-user' },
                userId: 'user-123',
                content: 'Updated content'
            },
            mockChannelProxy as any
        )).rejects.toThrow('You can only edit messages you proxied.');

        expect(mockChannelProxy.edit).not.toHaveBeenCalled();
    });
});
