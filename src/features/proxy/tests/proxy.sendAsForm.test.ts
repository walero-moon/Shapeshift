import { describe, it, expect, beforeEach, vi, Mocked } from 'vitest';
import { sendAsForm, SendAsFormInput } from '../app/SendAsForm';
import { DEFAULT_ALLOWED_MENTIONS } from '../../../shared/utils/allowedMentions';
import { ChannelProxyPort } from '../../../shared/ports/ChannelProxyPort';
import { Attachment } from 'discord.js';

// Mock the logger
vi.mock('../../../shared/utils/logger', () => ({
    log: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));

describe('sendAsForm function', () => {
    let mockChannelProxy: Mocked<ChannelProxyPort>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockChannelProxy = {
            send: vi.fn(),
            edit: vi.fn(),
            delete: vi.fn(),
        };
    });

    it('should send message successfully with form name and avatar', async () => {
        const mockResult = {
            webhookId: 'webhook123',
            webhookToken: 'token456',
            messageId: 'msg789',
        };
        mockChannelProxy.send.mockResolvedValue(mockResult);

        const input: SendAsFormInput = {
            userId: 'user1',
            form: {
                id: 'form1',
                userId: 'user1',
                name: 'Neoli',
                avatarUrl: 'https://example.com/avatar.png',
                createdAt: new Date(),
            },
            text: 'Hello world!',
            attachments: [],
            channelContext: {
                guildId: 'guild1',
                channelId: 'channel1',
            },
        };

        const result = await sendAsForm(input, mockChannelProxy);

        expect(result).toEqual(mockResult);
        expect(mockChannelProxy.send).toHaveBeenCalledWith({
            username: 'Neoli',
            content: 'Hello world!',
            allowedMentions: DEFAULT_ALLOWED_MENTIONS,
            avatarUrl: 'https://example.com/avatar.png',
            attachments: [],
        });
    });

    it('should send message without avatar when not provided', async () => {
        const mockResult = {
            webhookId: 'webhook123',
            webhookToken: 'token456',
            messageId: 'msg789',
        };
        mockChannelProxy.send.mockResolvedValue(mockResult);

        const input: SendAsFormInput = {
            userId: 'user1',
            form: {
                id: 'form1',
                userId: 'user1',
                name: 'Neoli',
                avatarUrl: null,
                createdAt: new Date(),
            },
            text: 'Hello world!',
            attachments: [],
            channelContext: {
                guildId: 'guild1',
                channelId: 'channel1',
            },
        };

        const result = await sendAsForm(input, mockChannelProxy);

        expect(result).toEqual(mockResult);
        expect(mockChannelProxy.send).toHaveBeenCalledWith({
            username: 'Neoli',
            content: 'Hello world!',
            allowedMentions: DEFAULT_ALLOWED_MENTIONS,
            attachments: [],
        });
        expect(mockChannelProxy.send).not.toHaveBeenCalledWith(
            expect.objectContaining({ avatarUrl: expect.anything() })
        );
    });

    it('should send message with attachments', async () => {
        const mockResult = {
            webhookId: 'webhook123',
            webhookToken: 'token456',
            messageId: 'msg789',
        };
        mockChannelProxy.send.mockResolvedValue(mockResult);

        const mockAttachments = [
            { id: 'att1', url: 'https://example.com/file1.png', name: 'file1.png' },
            { id: 'att2', url: 'https://example.com/file2.jpg', name: 'file2.jpg' },
        ];

        const input: SendAsFormInput = {
            userId: 'user1',
            form: {
                id: 'form1',
                userId: 'user1',
                name: 'Neoli',
                avatarUrl: 'https://example.com/avatar.png',
                createdAt: new Date(),
            },
            text: 'Hello with attachments!',
            attachments: mockAttachments as Attachment[],
            channelContext: {
                guildId: 'guild1',
                channelId: 'channel1',
            },
        };

        const result = await sendAsForm(input, mockChannelProxy);

        expect(result).toEqual(mockResult);
        expect(mockChannelProxy.send).toHaveBeenCalledWith({
            username: 'Neoli',
            content: 'Hello with attachments!',
            allowedMentions: DEFAULT_ALLOWED_MENTIONS,
            avatarUrl: 'https://example.com/avatar.png',
            attachments: mockAttachments,
        });
    });

    it('should return identifiers from channel proxy', async () => {
        const mockResult = {
            webhookId: 'webhook123',
            webhookToken: 'token456',
            messageId: 'msg789',
        };
        mockChannelProxy.send.mockResolvedValue(mockResult);

        const input: SendAsFormInput = {
            userId: 'user1',
            form: {
                id: 'form1',
                userId: 'user1',
                name: 'Neoli',
                avatarUrl: null,
                createdAt: new Date(),
            },
            text: 'Test message',
            attachments: [],
            channelContext: {
                guildId: 'guild1',
                channelId: 'channel1',
            },
        };

        const result = await sendAsForm(input, mockChannelProxy);

        expect(result).toEqual({
            webhookId: 'webhook123',
            webhookToken: 'token456',
            messageId: 'msg789',
        });
    });

    it('should suppress allowed mentions', async () => {
        const mockResult = {
            webhookId: 'webhook123',
            webhookToken: 'token456',
            messageId: 'msg789',
        };
        mockChannelProxy.send.mockResolvedValue(mockResult);

        const input: SendAsFormInput = {
            userId: 'user1',
            form: {
                id: 'form1',
                userId: 'user1',
                name: 'Neoli',
                avatarUrl: null,
                createdAt: new Date(),
            },
            text: '@everyone Hello!',
            attachments: [],
            channelContext: {
                guildId: 'guild1',
                channelId: 'channel1',
            },
        };

        await sendAsForm(input, mockChannelProxy);

        const sendCall = mockChannelProxy.send.mock.calls[0]?.[0];
        expect(sendCall).toBeDefined();
        if (sendCall) {
            expect(sendCall.allowedMentions).toEqual(DEFAULT_ALLOWED_MENTIONS);
            // Verify that mentions are suppressed (DEFAULT_ALLOWED_MENTIONS should have empty arrays)
            expect(sendCall.allowedMentions.parse).toEqual([]);
            expect(sendCall.allowedMentions.repliedUser).toBe(false);
        }
    });

    it('should handle channel proxy errors', async () => {
        mockChannelProxy.send.mockRejectedValue(new Error('Webhook failed'));

        const input: SendAsFormInput = {
            userId: 'user1',
            form: {
                id: 'form1',
                userId: 'user1',
                name: 'Neoli',
                avatarUrl: null,
                createdAt: new Date(),
            },
            text: 'Test message',
            attachments: [],
            channelContext: {
                guildId: 'guild1',
                channelId: 'channel1',
            },
        };

        await expect(sendAsForm(input, mockChannelProxy)).rejects.toThrow('Webhook failed');
    });
});