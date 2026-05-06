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

describe('ProxyMessageContext - Attachments Integration', () => {
    const mockChannelProxy = {
        send: vi.fn(),
        edit: vi.fn(),
        delete: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle multiple attachments successfully', async () => {
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
            content: 'Message with multiple attachments',
            attachments: [
                {
                    name: 'image1.png',
                    url: 'https://discord.com/attachments/123/image1.png',
                    id: 'att-1',
                    size: 1024
                },
                {
                    name: 'image2.jpg',
                    url: 'https://discord.com/attachments/123/image2.jpg',
                    id: 'att-2',
                    size: 2048
                },
                {
                    name: 'document.pdf',
                    url: 'https://discord.com/attachments/123/document.pdf',
                    id: 'att-3',
                    size: 5120
                }
            ],
            author: { bot: false, system: false }
        };

        const mockReuploadedAttachments = [
            { name: 'image1.png', data: Buffer.from('fake png data') },
            { name: 'image2.jpg', data: Buffer.from('fake jpg data') },
            { name: 'document.pdf', data: Buffer.from('fake pdf data') }
        ];

        const mockProxyResult = {
            webhookId: 'webhook-123',
            token: 'token-456',
            messageId: 'message-789'
        };

        vi.mocked(listForms).mockResolvedValue(mockForms);
        vi.mocked(reuploadAttachments).mockResolvedValue(mockReuploadedAttachments);
        vi.mocked(proxyCoordinator).mockResolvedValue(mockProxyResult);

        const result = await proxyMessageContext({
            userId: 'user-123',
            formId: 'form-1',
            targetMessage: mockTargetMessage,
            channelContext: {
                guildId: 'guild-123',
                channelId: 'channel-456'
            }
        }, mockChannelProxy);

        expect(reuploadAttachments).toHaveBeenCalledWith(mockTargetMessage.attachments);
        expect(proxyCoordinator).toHaveBeenCalledWith(
            'user-123',
            'form-1',
            'channel-456',
            'guild-123',
            'Message with multiple attachments',
            mockChannelProxy,
            mockReuploadedAttachments,
            undefined,
            expect.objectContaining({
                id: 'form-1',
                userId: 'user-123',
                name: 'Test Form'
            }),
            undefined,
            undefined,
            { recordLatch: true }
        );
        expect(result.messageId).toBe('message-789');
    });

    it('should handle partial attachment failures gracefully', async () => {
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
            content: 'Message with some failing attachments',
            attachments: [
                {
                    name: 'good.png',
                    url: 'https://discord.com/attachments/123/good.png',
                    id: 'att-1',
                    size: 1024
                },
                {
                    name: 'bad.png',
                    url: 'https://discord.com/attachments/123/bad.png',
                    id: 'att-2',
                    size: 2048
                }
            ],
            author: { bot: false, system: false }
        };

        // Only one attachment succeeds
        const mockReuploadedAttachments = [
            { name: 'good.png', data: Buffer.from('fake png data') }
        ];

        const mockProxyResult = {
            webhookId: 'webhook-123',
            token: 'token-456',
            messageId: 'message-789'
        };

        vi.mocked(listForms).mockResolvedValue(mockForms);
        vi.mocked(reuploadAttachments).mockResolvedValue(mockReuploadedAttachments);
        vi.mocked(proxyCoordinator).mockResolvedValue(mockProxyResult);

        const result = await proxyMessageContext({
            userId: 'user-123',
            formId: 'form-1',
            targetMessage: mockTargetMessage,
            channelContext: {
                guildId: 'guild-123',
                channelId: 'channel-456'
            }
        }, mockChannelProxy);

        expect(reuploadAttachments).toHaveBeenCalledWith(mockTargetMessage.attachments);
        expect(proxyCoordinator).toHaveBeenCalledWith(
            'user-123',
            'form-1',
            'channel-456',
            'guild-123',
            'Message with some failing attachments',
            mockChannelProxy,
            mockReuploadedAttachments, // Only successful attachments
            undefined,
            expect.objectContaining({
                id: 'form-1',
                userId: 'user-123',
                name: 'Test Form'
            }),
            undefined,
            undefined,
            { recordLatch: true }
        );
        expect(result.messageId).toBe('message-789');
    });

    it('should handle complete attachment failure', async () => {
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
            content: 'Message with failing attachments',
            attachments: [
                {
                    name: 'fail1.png',
                    url: 'https://discord.com/attachments/123/fail1.png',
                    id: 'att-1',
                    size: 1024
                },
                {
                    name: 'fail2.png',
                    url: 'https://discord.com/attachments/123/fail2.png',
                    id: 'att-2',
                    size: 2048
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
        vi.mocked(reuploadAttachments).mockResolvedValue([]); // All attachments fail
        vi.mocked(proxyCoordinator).mockResolvedValue(mockProxyResult);

        const result = await proxyMessageContext({
            userId: 'user-123',
            formId: 'form-1',
            targetMessage: mockTargetMessage,
            channelContext: {
                guildId: 'guild-123',
                channelId: 'channel-456'
            }
        }, mockChannelProxy);

        expect(reuploadAttachments).toHaveBeenCalledWith(mockTargetMessage.attachments);
        expect(proxyCoordinator).toHaveBeenCalledWith(
            'user-123',
            'form-1',
            'channel-456',
            'guild-123',
            'Message with failing attachments',
            mockChannelProxy,
            [], // No attachments
            undefined,
            expect.objectContaining({
                id: 'form-1',
                userId: 'user-123',
                name: 'Test Form'
            }),
            undefined,
            undefined,
            { recordLatch: true }
        );
        expect(result.messageId).toBe('message-789');
    });

    it('should handle large attachments appropriately', async () => {
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
            content: 'Message with large attachment',
            attachments: [
                {
                    name: 'large_file.zip',
                    url: 'https://discord.com/attachments/123/large_file.zip',
                    id: 'att-1',
                    size: 10 * 1024 * 1024 // 10MB - larger than threshold
                }
            ],
            author: { bot: false, system: false }
        };

        const mockReuploadedAttachments = [
            { name: 'large_file.zip', data: Buffer.from('fake large data') }
        ];

        const mockProxyResult = {
            webhookId: 'webhook-123',
            token: 'token-456',
            messageId: 'message-789'
        };

        vi.mocked(listForms).mockResolvedValue(mockForms);
        vi.mocked(reuploadAttachments).mockResolvedValue(mockReuploadedAttachments);
        vi.mocked(proxyCoordinator).mockResolvedValue(mockProxyResult);

        const result = await proxyMessageContext({
            userId: 'user-123',
            formId: 'form-1',
            targetMessage: mockTargetMessage,
            channelContext: {
                guildId: 'guild-123',
                channelId: 'channel-456'
            }
        }, mockChannelProxy);

        expect(reuploadAttachments).toHaveBeenCalledWith(mockTargetMessage.attachments);
        expect(proxyCoordinator).toHaveBeenCalledWith(
            'user-123',
            'form-1',
            'channel-456',
            'guild-123',
            'Message with large attachment',
            mockChannelProxy,
            mockReuploadedAttachments,
            undefined,
            expect.objectContaining({
                id: 'form-1',
                userId: 'user-123',
                name: 'Test Form'
            }),
            undefined,
            undefined,
            { recordLatch: true }
        );
        expect(result.messageId).toBe('message-789');
    });

    it('should handle attachments with special characters in names', async () => {
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
            content: 'Message with special attachment name',
            attachments: [
                {
                    name: 'file with spaces & special chars (test).png',
                    url: 'https://discord.com/attachments/123/file.png',
                    id: 'att-1',
                    size: 1024
                }
            ],
            author: { bot: false, system: false }
        };

        const mockReuploadedAttachments = [
            { name: 'file with spaces & special chars (test).png', data: Buffer.from('fake data') }
        ];

        const mockProxyResult = {
            webhookId: 'webhook-123',
            token: 'token-456',
            messageId: 'message-789'
        };

        vi.mocked(listForms).mockResolvedValue(mockForms);
        vi.mocked(reuploadAttachments).mockResolvedValue(mockReuploadedAttachments);
        vi.mocked(proxyCoordinator).mockResolvedValue(mockProxyResult);

        const result = await proxyMessageContext({
            userId: 'user-123',
            formId: 'form-1',
            targetMessage: mockTargetMessage,
            channelContext: {
                guildId: 'guild-123',
                channelId: 'channel-456'
            }
        }, mockChannelProxy);

        expect(reuploadAttachments).toHaveBeenCalledWith(mockTargetMessage.attachments);
        expect(proxyCoordinator).toHaveBeenCalledWith(
            'user-123',
            'form-1',
            'channel-456',
            'guild-123',
            'Message with special attachment name',
            mockChannelProxy,
            mockReuploadedAttachments,
            undefined,
            expect.objectContaining({
                id: 'form-1',
                userId: 'user-123',
                name: 'Test Form'
            }),
            undefined,
            undefined,
            { recordLatch: true }
        );
        expect(result.messageId).toBe('message-789');
    });
});
