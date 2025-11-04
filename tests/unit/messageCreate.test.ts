import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Client, Events, Message, Guild, GuildMember, PermissionsBitField, TextChannel } from 'discord.js';
import { registerMessageCreateListener } from '../../src/discord/listeners/messageCreate';

// Mock dependencies
vi.mock('../../src/config/env', () => ({
    env: { ENABLE_TAG_PROXY: true },
}));

vi.mock('../../src/utils/logger', () => ({
    logger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock('../../src/db/client', () => ({
    db: {
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                where: vi.fn(() => ({
                    limit: vi.fn(() => ({
                        execute: vi.fn(() => [{ id: 1, ownerUserId: 'user123' }]),
                    })),
                })),
            })),
        })),
        insert: vi.fn(() => ({
            values: vi.fn(() => ({
                execute: vi.fn(),
            })),
        })),
    },
}));

vi.mock('../../src/discord/services/FormService', () => ({
    FormService: class {
        getForms = vi.fn(() => Promise.resolve([{ id: 1, name: 'Alice', systemId: 1 }]));
    },
}));

vi.mock('../../src/discord/services/ProxyService', () => ({
    ProxyService: class {
        sendProxied = vi.fn(() => Promise.resolve({ messageId: 'msg123', channelId: 'chan123' }));
    },
}));

vi.mock('../../src/discord/middleware/permissionGuard', () => ({
    permissionGuard: vi.fn(() => ({ allowedMentions: {}, files: [] })),
}));

describe('registerMessageCreateListener', () => {
    let client: Client;
    let mockMessage: Message;

    beforeEach(() => {
        vi.clearAllMocks();
        client = new Client({ intents: [] });

        // Mock Guild
        const mockGuild = {
            id: 'guild123',
            members: {
                fetch: vi.fn(() => Promise.resolve({
                    id: 'user123',
                    permissionsIn: vi.fn(() => ({
                        has: vi.fn(() => true),
                    })),
                } as unknown as GuildMember)),
                me: { id: 'bot123' },
            },
        } as unknown as Guild;

        // Mock Channel
        const mockChannel = {
            id: 'chan123',
            guild: mockGuild,
            isTextBased: vi.fn(() => true),
            isDMBased: vi.fn(() => false),
        } as unknown as TextChannel;

        // Mock Message
        mockMessage = {
            id: 'msg123',
            content: 'Alice: Hello world',
            author: { id: 'user123', bot: false },
            guild: mockGuild,
            channel: mockChannel,
            attachments: new Map(),
            webhookId: null,
            delete: vi.fn(() => Promise.resolve()),
        } as unknown as Message;
    });

    it('should respect ENABLE_TAG_PROXY flag', async () => {
        vi.mocked(await import('../../src/config/env')).env.ENABLE_TAG_PROXY = false;
        await registerMessageCreateListener(client);
        client.emit(Events.MessageCreate, mockMessage);
        // Should not call any services
        expect(vi.mocked(await import('../../src/discord/services/FormService')).FormService).not.toHaveBeenCalled();
    });

    it('should ignore DMs', async () => {
        mockMessage.guild = null;
        await registerMessageCreateListener(client);
        client.emit(Events.MessageCreate, mockMessage);
        expect(vi.mocked(await import('../../src/discord/services/FormService')).FormService).not.toHaveBeenCalled();
    });

    it('should ignore bots', async () => {
        mockMessage.author.bot = true;
        await registerMessageCreateListener(client);
        client.emit(Events.MessageCreate, mockMessage);
        expect(vi.mocked(await import('../../src/discord/services/FormService')).FormService).not.toHaveBeenCalled();
    });

    it('should ignore webhooks', async () => {
        mockMessage.webhookId = 'webhook123';
        await registerMessageCreateListener(client);
        client.emit(Events.MessageCreate, mockMessage);
        expect(vi.mocked(await import('../../src/discord/services/FormService')).FormService).not.toHaveBeenCalled();
    });

    it('should ignore non-text channels', async () => {
        mockMessage.channel.isTextBased = vi.fn(() => false);
        await registerMessageCreateListener(client);
        client.emit(Events.MessageCreate, mockMessage);
        expect(vi.mocked(await import('../../src/discord/services/FormService')).FormService).not.toHaveBeenCalled();
    });

    it('should process valid tags with permission shaping', async () => {
        await registerMessageCreateListener(client);
        client.emit(Events.MessageCreate, mockMessage);

        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 0));

        const proxyServiceMock = vi.mocked(await import('../../src/discord/services/ProxyService')).ProxyService;
        expect(proxyServiceMock).toHaveBeenCalled();
        const proxyInstance = proxyServiceMock.mock.results[0].value;
        expect(proxyInstance.sendProxied).toHaveBeenCalledWith({
            actorUserId: 'user123',
            memberId: 1,
            channel: mockMessage.channel,
            content: 'Hello world',
            attachments: [],
            originalMessageId: 'msg123',
        });
    });

    it('should create DB linkage', async () => {
        await registerMessageCreateListener(client);
        client.emit(Events.MessageCreate, mockMessage);

        await new Promise(resolve => setTimeout(resolve, 0));

        const dbMock = vi.mocked(await import('../../src/db/client')).db;
        expect(dbMock.insert).toHaveBeenCalled();
    });

    it('should delete original message if bot has Manage Messages permission', async () => {
        await registerMessageCreateListener(client);
        client.emit(Events.MessageCreate, mockMessage);

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockMessage.delete).toHaveBeenCalled();
    });

    it('should not delete original message if bot lacks Manage Messages permission', async () => {
        const mockGuildMember = mockMessage.guild!.members.me as GuildMember;
        mockGuildMember.permissionsIn = vi.fn(() => ({
            has: vi.fn((perm) => perm !== PermissionsBitField.Flags.ManageMessages),
        }));

        await registerMessageCreateListener(client);
        client.emit(Events.MessageCreate, mockMessage);

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(mockMessage.delete).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
        const formServiceMock = vi.mocked(await import('../../src/discord/services/FormService')).FormService;
        memberServiceMock.mockImplementation(() => ({
            getMembers: vi.fn(() => Promise.reject(new Error('Test error'))),
        }));

        await registerMessageCreateListener(client);
        client.emit(Events.MessageCreate, mockMessage);

        await new Promise(resolve => setTimeout(resolve, 0));

        const loggerMock = vi.mocked(await import('../../src/utils/logger')).logger;
        expect(loggerMock.error).toHaveBeenCalled();
    });
});