import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Message } from 'discord.js';
import { messageCreateProxy } from '../../../adapters/discord/listeners/messageCreate.proxy';
import { ChannelProxyPort, ProxyAttachment } from '../../../shared/ports/ChannelProxyPort';

// Mock dependencies
vi.mock('../../../features/proxy/app/MatchAlias', () => ({
    matchAlias: vi.fn(),
    clearAliasCache: vi.fn(),
}));

vi.mock('../../../features/proxy/app/ValidateUserChannelPerms', () => ({
    validateUserChannelPerms: vi.fn(),
}));

vi.mock('../../../features/proxy/app/ProxyCoordinator', () => ({
    proxyCoordinator: vi.fn(),
}));

vi.mock('../../../shared/utils/attachments', () => ({
    reuploadAttachments: vi.fn(),
    splitAttachmentsBySize: vi.fn((attachments) => ({
        small: attachments,
        large: [],
    })),
}));

vi.mock('../../../features/identity/infra/FormRepo', () => ({
    formRepo: {
        getById: vi.fn(),
        getCachedByUserAndId: vi.fn(),
    },
}));

vi.mock('../../../adapters/discord/DiscordChannelProxy', () => ({
    DiscordChannelProxy: vi.fn(),
}));

vi.mock('../../../shared/utils/logger', () => ({
    log: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}));

vi.mock('../../../shared/utils/errorHandling', () => ({
    handleDegradedModeError: vi.fn(),
}));

vi.mock('../../../features/proxy/app/autoproxy/RecordLatchedForm', () => ({
    recordLatchedForm: vi.fn(() => Promise.resolve({ success: true })),
}));

vi.mock('../../../features/proxy/app/autoproxy/GetAutoproxyState', () => ({
    getAutoproxyState: vi.fn(() => Promise.resolve({ success: true, state: null })),
}));

// Import after mocking
import { matchAlias, clearAliasCache } from '../../../features/proxy/app/MatchAlias';
import { validateUserChannelPerms } from '../../../features/proxy/app/ValidateUserChannelPerms';
import { proxyCoordinator } from '../../../features/proxy/app/ProxyCoordinator';
import { formRepo } from '../../../features/identity/infra/FormRepo';
import { DiscordChannelProxy } from '../../../adapters/discord/DiscordChannelProxy';
import { reuploadAttachments } from '../../../shared/utils/attachments';
import { handleDegradedModeError } from '../../../shared/utils/errorHandling';
import { getAutoproxyState } from '../../../features/proxy/app/autoproxy/GetAutoproxyState';

describe('messageCreateProxy function', () => {
    let mockMessage: Message<boolean>;
    let mockChannelProxy: ChannelProxyPort;

    beforeEach(() => {
        vi.clearAllMocks();
        clearAliasCache();
        vi.mocked(getAutoproxyState).mockResolvedValue({ success: true, state: null });

        mockMessage = {
            id: 'message123',
            author: { bot: false, id: 'user123' },
            content: 'n:text hello world',
            channelId: 'channel456',
            guildId: 'guild789',
            attachments: {
                size: 0,
                values: () => [][Symbol.iterator](),
            },
            channel: { id: 'channel456', isTextBased: () => true } as any,
            guild: {
                members: { fetch: vi.fn() }
            } as any,
            delete: vi.fn().mockResolvedValue(undefined),
        } as unknown as Message<boolean>;

        mockChannelProxy = {
            send: vi.fn(),
            edit: vi.fn(),
            delete: vi.fn(),
        };

        vi.mocked(DiscordChannelProxy).mockImplementation(() => mockChannelProxy as DiscordChannelProxy);
        vi.mocked(mockMessage.guild!.members.fetch).mockResolvedValue({} as any); // Mock successful member fetch
        vi.mocked(handleDegradedModeError).mockImplementation((fn) => fn()); // Execute the function for testing and return the promise
    });

    it('should skip bot messages', async () => {
        mockMessage.author.bot = true;

        await messageCreateProxy(mockMessage);

        expect(matchAlias).not.toHaveBeenCalled();
    });

    it('should skip messages without content', async () => {
        mockMessage.content = '';

        await messageCreateProxy(mockMessage);

        expect(matchAlias).not.toHaveBeenCalled();
    });

    it('should skip messages that do not match any alias', async () => {
        vi.mocked(matchAlias).mockResolvedValue(null);

        await messageCreateProxy(mockMessage);

        expect(matchAlias).toHaveBeenCalledWith('user123', 'n:text hello world');
        expect(proxyCoordinator).not.toHaveBeenCalled();
    });

    it('should proxy message when alias matches', async () => {
        const mockMatch = {
            alias: {
                id: 'alias1',
                userId: 'user123',
                formId: 'form1',
                triggerRaw: 'n:text',
                triggerNorm: 'n:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
                prefix: 'n:',
            },
            renderedText: 'hello world',
        };

        const mockForm = {
            id: 'form1',
            userId: 'user123',
            name: 'Neoli',
            avatarUrl: 'https://example.com/avatar.png',
            createdAt: new Date(),
        };

        vi.mocked(matchAlias).mockResolvedValue(mockMatch);
        vi.mocked(formRepo.getCachedByUserAndId).mockResolvedValue(mockForm);
        vi.mocked(validateUserChannelPerms).mockResolvedValue(true);
        vi.mocked(proxyCoordinator).mockResolvedValue({
            webhookId: 'webhook123',
            token: 'token456',
            messageId: 'msg789',
        });

        await messageCreateProxy(mockMessage);

        expect(matchAlias).toHaveBeenCalledWith('user123', 'n:text hello world');
        expect(formRepo.getCachedByUserAndId).toHaveBeenCalledWith('user123', 'form1');
        expect(validateUserChannelPerms).toHaveBeenCalledWith('user123', expect.any(Object), [], expect.any(Object));
        expect(handleDegradedModeError).toHaveBeenCalledWith(
            expect.any(Function),
            {
                component: 'proxy',
                userId: 'user123',
                guildId: 'guild789',
                channelId: 'channel456',
                status: 'degraded_mode_fallback'
            },
            undefined,
            'delete proxied source'
        );
        expect(mockMessage.delete).toHaveBeenCalled();
        const optionsArg = vi.mocked(proxyCoordinator).mock.calls[0]?.[11];
        expect(optionsArg).toEqual({ recordLatch: true });
    });

    it('should skip proxying if user lacks permissions', async () => {
        const mockMatch = {
            alias: {
                id: 'alias1',
                userId: 'user123',
                formId: 'form1',
                triggerRaw: 'n:text',
                triggerNorm: 'n:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
                prefix: 'n:',
            },
            renderedText: 'hello world',
        };

        const mockForm = {
            id: 'form1',
            userId: 'user123',
            name: 'Neoli',
            avatarUrl: 'https://example.com/avatar.png',
            createdAt: new Date(),
        };

        vi.mocked(matchAlias).mockResolvedValue(mockMatch);
        vi.mocked(formRepo.getCachedByUserAndId).mockResolvedValue(mockForm);
        vi.mocked(validateUserChannelPerms).mockResolvedValue(false);

        await messageCreateProxy(mockMessage);

        expect(matchAlias).toHaveBeenCalledWith('user123', 'n:text hello world');
        expect(formRepo.getCachedByUserAndId).toHaveBeenCalledWith('user123', 'form1');
        expect(validateUserChannelPerms).toHaveBeenCalledWith('user123', expect.any(Object), expect.any(Array), expect.any(Object));
        expect(DiscordChannelProxy).not.toHaveBeenCalled();
        expect(proxyCoordinator).not.toHaveBeenCalled();
    });

    it('should handle messages with attachments', async () => {
        const mockMatch = {
            alias: {
                id: 'alias1',
                userId: 'user123',
                formId: 'form1',
                triggerRaw: 'n:text',
                triggerNorm: 'n:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
                prefix: 'n:',
            },
            renderedText: 'hello world',
        };

        const mockForm = {
            id: 'form1',
            userId: 'user123',
            name: 'Neoli',
            avatarUrl: null,
            createdAt: new Date(),
        };

        const attachmentEntity = {
            id: 'att1',
            url: 'https://example.com/file.png',
            name: 'file.png',
            size: 1024,
        };
        const attachmentCollection = new Map<string, typeof attachmentEntity>([
            [attachmentEntity.id, attachmentEntity],
        ]);

        const mockReuploadedAttachments: ProxyAttachment[] = [
            {
                name: 'file.png',
                data: Buffer.from('test file content'),
            },
        ];

        (mockMessage.attachments as unknown) = {
            size: attachmentCollection.size,
            values: () => attachmentCollection.values(),
        };

        vi.mocked(matchAlias).mockResolvedValue(mockMatch);
        vi.mocked(formRepo.getCachedByUserAndId).mockResolvedValue(mockForm);
        vi.mocked(validateUserChannelPerms).mockResolvedValue(true);
        vi.mocked(reuploadAttachments).mockResolvedValue(mockReuploadedAttachments as any);
        vi.mocked(proxyCoordinator).mockResolvedValue({
            webhookId: 'webhook123',
            token: 'token456',
            messageId: 'msg789',
        });

        await messageCreateProxy(mockMessage);

        // Verify reuploadAttachments was called with Discord attachment format
        expect(reuploadAttachments).toHaveBeenCalledWith([
            expect.objectContaining({
                id: 'att1',
                url: 'https://example.com/file.png',
                name: 'file.png',
                size: 1024,
            })
        ]);

        // Verify validateUserChannelPerms was called with attachments
        expect(validateUserChannelPerms).toHaveBeenCalledWith('user123', expect.any(Object), expect.any(Array), expect.any(Object));

        // Verify proxyCoordinator was called with ProxyAttachment format
        expect(proxyCoordinator).toHaveBeenCalledWith(
            'user123',
            'form1',
            'channel456',
            'guild789',
            'hello world',
            mockChannelProxy,
            mockReuploadedAttachments,
            undefined,
            mockForm,
            null,
            'message123',
            { recordLatch: true }
        );
    });

    it('should fallback to autoproxy when no alias match', async () => {
        const autoproxyState = {
            id: 'state1',
            userId: 'user123',
            guildId: 'guild789',
            channelId: null,
            mode: 'form' as const,
            formId: 'form1',
            lastFormId: null,
            expiresAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const mockForm = {
            id: 'form1',
            userId: 'user123',
            name: 'Neoli',
            avatarUrl: null,
            createdAt: new Date(),
        };

        vi.mocked(matchAlias).mockResolvedValue(null);
        vi.mocked(getAutoproxyState).mockResolvedValue({ success: true, state: autoproxyState });
        vi.mocked(formRepo.getCachedByUserAndId).mockResolvedValue(mockForm);
        vi.mocked(validateUserChannelPerms).mockResolvedValue(true);
        vi.mocked(proxyCoordinator).mockResolvedValue({
            webhookId: 'webhook123',
            token: 'token456',
            messageId: 'msg789',
        });

        mockMessage.content = 'plain message';

        await messageCreateProxy(mockMessage);

        expect(proxyCoordinator).toHaveBeenCalledWith(
            'user123',
            'form1',
            'channel456',
            'guild789',
            'plain message',
            expect.any(Object),
            expect.any(Array),
            undefined,
            mockForm,
            null,
            'message123',
            { recordLatch: false }
        );
    });

    it('should handle form not found', async () => {
        const mockMatch = {
            alias: {
                id: 'alias1',
                userId: 'user123',
                formId: 'form1',
                triggerRaw: 'n:text',
                triggerNorm: 'n:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
                prefix: 'n:',
            },
            renderedText: 'hello world',
        };

        vi.mocked(matchAlias).mockResolvedValue(mockMatch);
        vi.mocked(formRepo.getCachedByUserAndId).mockResolvedValue(null);

        await messageCreateProxy(mockMessage);

        expect(proxyCoordinator).not.toHaveBeenCalled();
    });

    it('should handle proxyCoordinator errors gracefully', async () => {
        const mockMatch = {
            alias: {
                id: 'alias1',
                userId: 'user123',
                formId: 'form1',
                triggerRaw: 'n:text',
                triggerNorm: 'n:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
                prefix: 'n:',
            },
            renderedText: 'hello world',
        };

        const mockForm = {
            id: 'form1',
            userId: 'user123',
            name: 'Neoli',
            avatarUrl: null,
            createdAt: new Date(),
        };

        vi.mocked(matchAlias).mockResolvedValue(mockMatch);
        vi.mocked(formRepo.getCachedByUserAndId).mockResolvedValue(mockForm);
        vi.mocked(validateUserChannelPerms).mockResolvedValue(true);
        vi.mocked(proxyCoordinator).mockRejectedValue(new Error('Webhook failed'));

        // Should not throw
        await expect(messageCreateProxy(mockMessage)).resolves.toBeUndefined();

        expect(proxyCoordinator).toHaveBeenCalled();
    });

    it('should handle matchAlias errors gracefully', async () => {
        vi.mocked(matchAlias).mockRejectedValue(new Error('Database error'));

        // Should not throw
        await expect(messageCreateProxy(mockMessage)).resolves.toBeUndefined();

        expect(proxyCoordinator).not.toHaveBeenCalled();
    });

    it('should handle form lookup errors gracefully', async () => {
        const mockMatch = {
            alias: {
                id: 'alias1',
                userId: 'user123',
                formId: 'form1',
                triggerRaw: 'n:text',
                triggerNorm: 'n:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
                prefix: 'n:',
            },
            renderedText: 'hello world',
        };

        vi.mocked(matchAlias).mockResolvedValue(mockMatch);
        vi.mocked(formRepo.getCachedByUserAndId).mockRejectedValue(new Error('Database error'));

        // Should not throw
        await expect(messageCreateProxy(mockMessage)).resolves.toBeUndefined();

        expect(proxyCoordinator).not.toHaveBeenCalled();
    });

    it('should handle member fetch failure gracefully', async () => {
        const mockMatch = {
            alias: {
                id: 'alias1',
                userId: 'user123',
                formId: 'form1',
                triggerRaw: 'n:text',
                triggerNorm: 'n:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
                prefix: 'n:',
            },
            renderedText: 'hello world',
        };

        const mockForm = {
            id: 'form1',
            userId: 'user123',
            name: 'Neoli',
            avatarUrl: 'https://example.com/avatar.png',
            createdAt: new Date(),
        };

        vi.mocked(matchAlias).mockResolvedValue(mockMatch);
        vi.mocked(formRepo.getCachedByUserAndId).mockResolvedValue(mockForm);
        vi.mocked(mockMessage.guild!.members.fetch).mockRejectedValue(new Error('Member fetch error'));

        // Should not throw
        await expect(messageCreateProxy(mockMessage)).resolves.toBeUndefined();

        expect(proxyCoordinator).not.toHaveBeenCalled();
    });

    it('should handle attachment reupload failure gracefully', async () => {
        const mockMatch = {
            alias: {
                id: 'alias1',
                userId: 'user123',
                formId: 'form1',
                triggerRaw: 'n:text',
                triggerNorm: 'n:text',
                kind: 'prefix' as const,
                createdAt: new Date(),
                prefix: 'n:',
            },
            renderedText: 'hello world',
        };

        const mockForm = {
            id: 'form1',
            userId: 'user123',
            name: 'Neoli',
            avatarUrl: null,
            createdAt: new Date(),
        };

        const failureAttachment = {
            id: 'att1',
            url: 'https://example.com/file.png',
            name: 'file.png',
            size: 512,
        };
        const failureCollection = new Map<string, typeof failureAttachment>([
            [failureAttachment.id, failureAttachment],
        ]);

        (mockMessage.attachments as unknown) = {
            size: failureCollection.size,
            values: () => failureCollection.values(),
        };

        vi.mocked(matchAlias).mockResolvedValue(mockMatch);
        vi.mocked(formRepo.getCachedByUserAndId).mockResolvedValue(mockForm);
        vi.mocked(validateUserChannelPerms).mockResolvedValue(true);
        vi.mocked(reuploadAttachments).mockRejectedValue(new Error('Reupload failed'));
        vi.mocked(proxyCoordinator).mockResolvedValue({
            webhookId: 'webhook123',
            token: 'token456',
            messageId: 'msg789',
        });

        await messageCreateProxy(mockMessage);

        // Should still call proxyCoordinator with empty attachments
        expect(proxyCoordinator).toHaveBeenCalledWith(
            'user123',
            'form1',
            'channel456',
            'guild789',
            'hello world',
            mockChannelProxy,
            [], // Empty attachments due to failure
            undefined,
            mockForm,
            null,
            'message123',
            { recordLatch: true }
        );
    });
});
