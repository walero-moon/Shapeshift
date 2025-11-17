import { describe, it, expect, vi, beforeEach } from 'vitest';
import { proxyMessageContext } from '../app/ProxyMessageContext';
import { listForms } from '../../identity/app/ListForms';
import { proxyCoordinator } from '../app/ProxyCoordinator';
import { reuploadAttachments } from '../../../shared/utils/attachments';

// Mock dependencies
vi.mock('../../identity/app/ListForms');
vi.mock('../app/ProxyCoordinator');
vi.mock('../../../shared/utils/attachments');
vi.mock('../../../shared/utils/logger');

describe('proxyMessageContext', () => {
    const mockChannelProxy = {
        send: vi.fn(),
        edit: vi.fn(),
        delete: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should successfully proxy a message as a form', async () => {
        // Mock data
        const mockForms = [
            {
                id: 'form-1',
                name: 'Test Form',
                avatarUrl: 'https://example.com/avatar.png',
                createdAt: new Date(),
                aliases: []
            }
        ];

        const mockTargetMessage = {
            content: 'Hello world',
            attachments: [],
            author: { bot: false, system: false }
        };

        const mockProxyResult = {
            webhookId: 'webhook-123',
            token: 'token-456',
            messageId: 'message-789'
        };

        // Mock implementations
        vi.mocked(listForms).mockResolvedValue(mockForms);
        vi.mocked(proxyCoordinator).mockResolvedValue(mockProxyResult);
        vi.mocked(reuploadAttachments).mockResolvedValue([]);

        // Execute
        const result = await proxyMessageContext({
            userId: 'user-123',
            formId: 'form-1',
            targetMessage: mockTargetMessage,
            channelContext: {
                guildId: 'guild-123',
                channelId: 'channel-456'
            },
            deleteOriginal: false,
            sourceMessageId: 'source-1'
        }, mockChannelProxy);

        // Assertions
        expect(listForms).toHaveBeenCalledWith('user-123');
        expect(proxyCoordinator).toHaveBeenCalledWith(
            'user-123',
            'form-1',
            'channel-456',
            'guild-123',
            'Hello world',
            mockChannelProxy,
            undefined,
            undefined,
            expect.objectContaining({
                id: 'form-1',
                userId: 'user-123',
                name: 'Test Form'
            }),
            undefined,
            'source-1'
        );
        expect(result).toEqual({
            webhookId: 'webhook-123',
            webhookToken: 'token-456',
            messageId: 'message-789',
            originalDeleted: false
        });
    });

    it('should handle attachments by reuploading them', async () => {
        const mockForms = [
            {
                id: 'form-1',
                name: 'Test Form',
                avatarUrl: null,
                createdAt: new Date(),
                aliases: []
            }
        ];

        const mockTargetMessage = {
            content: 'Message with attachment',
            attachments: [
                {
                    name: 'test.png',
                    url: 'https://discord.com/attachments/test.png',
                    id: 'att-1',
                    size: 1024
                }
            ],
            author: { bot: false, system: false }
        };

        const mockReuploadedAttachments = [
            { name: 'test.png', data: Buffer.from('fake data') }
        ];

        const mockProxyResult = {
            webhookId: 'webhook-123',
            token: 'token-456',
            messageId: 'message-789'
        };

        vi.mocked(listForms).mockResolvedValue(mockForms);
        vi.mocked(reuploadAttachments).mockResolvedValue(mockReuploadedAttachments);
        vi.mocked(proxyCoordinator).mockResolvedValue(mockProxyResult);

        await proxyMessageContext({
            userId: 'user-123',
            formId: 'form-1',
            targetMessage: mockTargetMessage,
            channelContext: {
                guildId: 'guild-123',
                channelId: 'channel-456'
            },
            deleteOriginal: true,
            sourceMessageId: 'source-1'
        }, mockChannelProxy);

        expect(reuploadAttachments).toHaveBeenCalledWith(mockTargetMessage.attachments);
        expect(proxyCoordinator).toHaveBeenCalledWith(
            'user-123',
            'form-1',
            'channel-456',
            'guild-123',
            'Message with attachment',
            mockChannelProxy,
            mockReuploadedAttachments,
            undefined,
            expect.objectContaining({
                id: 'form-1',
                userId: 'user-123',
                name: 'Test Form'
            }),
            undefined,
            'source-1'
        );
    });

    it('should throw error for bot messages', async () => {
        const mockTargetMessage = {
            content: 'Bot message',
            attachments: [],
            author: { bot: true, system: false }
        };

        await expect(proxyMessageContext({
            userId: 'user-123',
            formId: 'form-1',
            targetMessage: mockTargetMessage,
            channelContext: {
                guildId: 'guild-123',
                channelId: 'channel-456'
            },
            sourceMessageId: 'source-1'
        }, mockChannelProxy)).rejects.toThrow('Cannot proxy bot or system messages');
    });

    it('should throw error for system messages', async () => {
        const mockTargetMessage = {
            content: 'System message',
            attachments: [],
            author: { bot: false, system: true }
        };

        await expect(proxyMessageContext({
            userId: 'user-123',
            formId: 'form-1',
            targetMessage: mockTargetMessage,
            channelContext: {
                guildId: 'guild-123',
                channelId: 'channel-456'
            },
            sourceMessageId: 'source-1'
        }, mockChannelProxy)).rejects.toThrow('Cannot proxy bot or system messages');
    });

    it('should throw error when user does not own the form', async () => {
        const mockForms = [
            {
                id: 'form-1',
                name: 'Test Form',
                avatarUrl: null,
                createdAt: new Date(),
                aliases: []
            }
        ];

        const mockTargetMessage = {
            content: 'Hello',
            attachments: [],
            author: { bot: false, system: false }
        };

        vi.mocked(listForms).mockResolvedValue(mockForms);

        await expect(proxyMessageContext({
            userId: 'user-123',
            formId: 'non-existent-form',
            targetMessage: mockTargetMessage,
            channelContext: {
                guildId: 'guild-123',
                channelId: 'channel-456'
            },
            sourceMessageId: 'source-1'
        }, mockChannelProxy)).rejects.toThrow('You do not own this form or it does not exist.');
    });

    it('should handle attachment reupload failures gracefully', async () => {
        const mockForms = [
            {
                id: 'form-1',
                name: 'Test Form',
                avatarUrl: null,
                createdAt: new Date(),
                aliases: []
            }
        ];

        const mockTargetMessage = {
            content: 'Message with failing attachment',
            attachments: [
                {
                    name: 'fail.png',
                    url: 'https://discord.com/attachments/fail.png',
                    id: 'att-1',
                    size: 1024
                }
            ],
            author: { bot: false, system: false }
        };

        const mockProxyResult = {
            webhookId: 'webhook-123',
            token: 'token-456',
            messageId: 'message-789'
        };

        vi.mocked(listForms).mockResolvedValue(mockForms);
        vi.mocked(reuploadAttachments).mockResolvedValue([]); // Empty array for failed reuploads
        vi.mocked(proxyCoordinator).mockResolvedValue(mockProxyResult);

        const result = await proxyMessageContext({
            userId: 'user-123',
            formId: 'form-1',
            targetMessage: mockTargetMessage,
            channelContext: {
                guildId: 'guild-123',
                channelId: 'channel-456'
            },
            sourceMessageId: 'source-1'
        }, mockChannelProxy);

        expect(result.messageId).toBe('message-789');
        expect(proxyCoordinator).toHaveBeenCalledWith(
            'user-123',
            'form-1',
            'channel-456',
            'guild-123',
            'Message with failing attachment',
            mockChannelProxy,
            [], // No attachments due to failure
            undefined,
            expect.objectContaining({
                id: 'form-1',
                userId: 'user-123',
                name: 'Test Form'
            }),
            undefined,
            'source-1'
        );
    });
});
