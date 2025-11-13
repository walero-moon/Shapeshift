import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Message } from 'discord.js';
import { messageCreateProxy } from '../../../adapters/discord/listeners/messageCreate.proxy';
import { ChannelProxyPort, ProxyAttachment } from '../../../shared/ports/ChannelProxyPort';

// Mock dependencies
vi.mock('../../../features/proxy/app/MatchAlias', () => ({
    matchAlias: vi.fn(),
}));

vi.mock('../../../features/proxy/app/ValidateUserChannelPerms', () => ({
    validateUserChannelPerms: vi.fn(),
}));

vi.mock('../../../features/proxy/app/ProxyCoordinator', () => ({
    proxyCoordinator: vi.fn(),
}));

vi.mock('../../../shared/utils/attachments', () => ({
    reuploadAttachments: vi.fn(),
}));

vi.mock('../../../features/identity/infra/FormRepo', () => ({
    formRepo: {
        getById: vi.fn(),
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

// Import after mocking
import { matchAlias } from '../../../features/proxy/app/MatchAlias';
import { validateUserChannelPerms } from '../../../features/proxy/app/ValidateUserChannelPerms';
import { proxyCoordinator } from '../../../features/proxy/app/ProxyCoordinator';
import { formRepo } from '../../../features/identity/infra/FormRepo';
import { DiscordChannelProxy } from '../../../adapters/discord/DiscordChannelProxy';
import { reuploadAttachments } from '../../../shared/utils/attachments';

describe('messageCreateProxy function', () => {
    let mockMessage: Message<boolean>;
    let mockChannelProxy: ChannelProxyPort;

    beforeEach(() => {
        vi.clearAllMocks();

        mockMessage = {
            author: { bot: false, id: 'user123' },
            content: 'n:text hello world',
            channelId: 'channel456',
            guildId: 'guild789',
            attachments: [],
            channel: { id: 'channel456', isTextBased: () => true } as any,
        } as unknown as Message<boolean>;

        mockChannelProxy = {
            send: vi.fn(),
            edit: vi.fn(),
            delete: vi.fn(),
        };

        vi.mocked(DiscordChannelProxy).mockImplementation(() => mockChannelProxy as DiscordChannelProxy);
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
        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);
        vi.mocked(validateUserChannelPerms).mockResolvedValue(true);
        vi.mocked(proxyCoordinator).mockResolvedValue({
            webhookId: 'webhook123',
            token: 'token456',
            messageId: 'msg789',
        });

        await messageCreateProxy(mockMessage);

        expect(matchAlias).toHaveBeenCalledWith('user123', 'n:text hello world');
        expect(formRepo.getById).toHaveBeenCalledWith('form1');
        expect(validateUserChannelPerms).toHaveBeenCalledWith('user123', expect.any(Object), []);
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
        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);
        vi.mocked(validateUserChannelPerms).mockResolvedValue(false);

        await messageCreateProxy(mockMessage);

        expect(matchAlias).toHaveBeenCalledWith('user123', 'n:text hello world');
        expect(formRepo.getById).toHaveBeenCalledWith('form1');
        expect(validateUserChannelPerms).toHaveBeenCalledWith('user123', expect.any(Object), []);
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

        const mockDiscordAttachments = [
            {
                id: 'att1',
                url: 'https://example.com/file.png',
                name: 'file.png',
            },
        ];

        const mockReuploadedAttachments: ProxyAttachment[] = [
            {
                name: 'file.png',
                data: Buffer.from('test file content'),
            },
        ];

        (mockMessage.attachments as unknown) = mockDiscordAttachments.map(att => ({
            ...att,
            toJSON: () => att,
        }));

        vi.mocked(matchAlias).mockResolvedValue(mockMatch);
        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);
        vi.mocked(validateUserChannelPerms).mockResolvedValue(true);
        vi.mocked(reuploadAttachments).mockResolvedValue(mockReuploadedAttachments);
        vi.mocked(proxyCoordinator).mockResolvedValue({
            webhookId: 'webhook123',
            token: 'token456',
            messageId: 'msg789',
        });

        await messageCreateProxy(mockMessage);

        // Verify reuploadAttachments was called with Discord attachment format
        expect(reuploadAttachments).toHaveBeenCalledWith(mockDiscordAttachments);

        // Verify proxyCoordinator was called with ProxyAttachment format
        expect(proxyCoordinator).toHaveBeenCalledWith(
            'user123',
            'form1',
            'channel456',
            'guild789',
            'hello world',
            mockChannelProxy,
            mockReuploadedAttachments,
            undefined
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
            },
            renderedText: 'hello world',
        };

        vi.mocked(matchAlias).mockResolvedValue(mockMatch);
        vi.mocked(formRepo.getById).mockResolvedValue(null);

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
        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);
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
            },
            renderedText: 'hello world',
        };

        vi.mocked(matchAlias).mockResolvedValue(mockMatch);
        vi.mocked(formRepo.getById).mockRejectedValue(new Error('Database error'));

        // Should not throw
        await expect(messageCreateProxy(mockMessage)).resolves.toBeUndefined();

        expect(proxyCoordinator).not.toHaveBeenCalled();
    });
});