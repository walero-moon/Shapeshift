import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Message } from 'discord.js';
import { messageCreateProxy } from '../../../adapters/discord/listeners/messageCreate.proxy';
import { ChannelProxyPort } from '../../../shared/ports/ChannelProxyPort';

// Mock dependencies
vi.mock('../../../features/proxy/app/MatchAlias', () => ({
    matchAlias: vi.fn(),
}));

vi.mock('../../../features/proxy/app/SendAsForm', () => ({
    sendAsForm: vi.fn(),
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
    },
}));

// Import after mocking
import { matchAlias } from '../../../features/proxy/app/MatchAlias';
import { sendAsForm } from '../../../features/proxy/app/SendAsForm';
import { formRepo } from '../../../features/identity/infra/FormRepo';
import { DiscordChannelProxy } from '../../../adapters/discord/DiscordChannelProxy';

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
        expect(sendAsForm).not.toHaveBeenCalled();
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
        vi.mocked(sendAsForm).mockResolvedValue({
            webhookId: 'webhook123',
            webhookToken: 'token456',
            messageId: 'msg789',
        });

        await messageCreateProxy(mockMessage);

        expect(matchAlias).toHaveBeenCalledWith('user123', 'n:text hello world');
        expect(formRepo.getById).toHaveBeenCalledWith('form1');
        expect(DiscordChannelProxy).toHaveBeenCalledWith('channel456');
        expect(sendAsForm).toHaveBeenCalledWith(
            {
                userId: 'user123',
                form: mockForm,
                text: 'hello world',
                attachments: [],
                channelContext: {
                    guildId: 'guild789',
                    channelId: 'channel456',
                },
            },
            mockChannelProxy
        );
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

        const mockAttachments = [
            {
                id: 'att1',
                url: 'https://example.com/file.png',
                name: 'file.png',
                size: 1024,
                contentType: 'image/png',
                proxyURL: 'https://cdn.example.com/file.png',
                height: 100,
                width: 100,
            },
        ];

        (mockMessage.attachments as unknown) = mockAttachments.map(att => ({
            ...att,
            toJSON: () => att,
        }));

        vi.mocked(matchAlias).mockResolvedValue(mockMatch);
        vi.mocked(formRepo.getById).mockResolvedValue(mockForm);
        vi.mocked(sendAsForm).mockResolvedValue({
            webhookId: 'webhook123',
            webhookToken: 'token456',
            messageId: 'msg789',
        });

        await messageCreateProxy(mockMessage);

        const expectedAttachments = mockAttachments.map(att => ({
            ...att,
            toJSON: () => att,
        }));

        expect(sendAsForm).toHaveBeenCalledWith(
            expect.objectContaining({
                attachments: expect.any(Array),
                channelContext: expect.objectContaining({
                    guildId: 'guild789',
                    channelId: 'channel456',
                }),
                form: expect.objectContaining({
                    id: 'form1',
                    userId: 'user123',
                    name: 'Neoli',
                    avatarUrl: null,
                    createdAt: expect.any(Date),
                }),
                text: 'hello world',
                userId: 'user123',
            }),
            mockChannelProxy
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

        expect(sendAsForm).not.toHaveBeenCalled();
    });

    it('should handle sendAsForm errors gracefully', async () => {
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
        vi.mocked(sendAsForm).mockRejectedValue(new Error('Webhook failed'));

        // Should not throw
        await expect(messageCreateProxy(mockMessage)).resolves.toBeUndefined();

        expect(sendAsForm).toHaveBeenCalled();
    });

    it('should handle matchAlias errors gracefully', async () => {
        vi.mocked(matchAlias).mockRejectedValue(new Error('Database error'));

        // Should not throw
        await expect(messageCreateProxy(mockMessage)).resolves.toBeUndefined();

        expect(sendAsForm).not.toHaveBeenCalled();
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

        expect(sendAsForm).not.toHaveBeenCalled();
    });
});