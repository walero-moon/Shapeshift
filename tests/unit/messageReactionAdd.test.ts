import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerMessageReactionAddListener } from '../../src/discord/listeners/messageReactionAdd';
import { DeleteService } from '../../src/discord/services/DeleteService';
import { Client, MessageReaction, User, PartialMessageReaction, PartialUser, PermissionsBitField } from 'discord.js';

// Mock DeleteService
vi.mock('../../src/discord/services/DeleteService', () => ({
    DeleteService: class {
        deleteProxied = vi.fn();
    },
}));

// Mock the database
vi.mock('../../src/db/client', () => ({
    db: {
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                where: vi.fn(() => ({
                    limit: vi.fn(() => ({
                        execute: vi.fn(),
                    })),
                })),
            })),
        })),
    },
}));

describe('messageReactionAdd listener', () => {
    let client: Client;
    let mockDeleteService: any;
    let mockDb: any;

    beforeEach(() => {
        vi.clearAllMocks();
        client = new Client({ intents: [] });
        mockDeleteService = new (require('../../src/discord/services/DeleteService').DeleteService)();
        mockDb = require('../../src/db/client').db;
        registerMessageReactionAddListener(client);
    });

    it('should ignore bot reactions', async () => {
        const mockReaction = {
            emoji: { name: '🗑️' },
            message: { guild: {} },
        } as MessageReaction;
        const mockUser = { bot: true } as User;

        await client.emit('messageReactionAdd', mockReaction, mockUser);

        expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('should ignore non-trash reactions', async () => {
        const mockReaction = {
            emoji: { name: '👍' },
            message: { guild: {} },
        } as MessageReaction;
        const mockUser = { bot: false } as User;

        await client.emit('messageReactionAdd', mockReaction, mockUser);

        expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('should ignore reactions in DMs', async () => {
        const mockReaction = {
            emoji: { name: '🗑️' },
            message: { guild: null },
        } as MessageReaction;
        const mockUser = { bot: false } as User;

        await client.emit('messageReactionAdd', mockReaction, mockUser);

        expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('should fetch partial reactions', async () => {
        const mockReaction = {
            emoji: { name: '🗑️' },
            message: { guild: {}, partial: true, fetch: vi.fn() },
            partial: true,
            fetch: vi.fn(),
        } as PartialMessageReaction;
        const mockUser = { bot: false, partial: false } as User;

        mockReaction.fetch.mockResolvedValue(mockReaction);
        mockReaction.message.fetch.mockResolvedValue(mockReaction.message);
        mockDb.select().from().where().limit().execute.mockResolvedValue([]);

        await client.emit('messageReactionAdd', mockReaction, mockUser);

        expect(mockReaction.fetch).toHaveBeenCalled();
        expect(mockReaction.message.fetch).toHaveBeenCalled();
    });

    it('should fetch partial users', async () => {
        const mockReaction = {
            emoji: { name: '🗑️' },
            message: { guild: {}, partial: false },
            partial: false,
        } as MessageReaction;
        const mockUser = { bot: false, partial: true, fetch: vi.fn() } as PartialUser;

        mockUser.fetch.mockResolvedValue(mockUser);
        mockDb.select().from().where().limit().execute.mockResolvedValue([]);

        await client.emit('messageReactionAdd', mockReaction, mockUser);

        expect(mockUser.fetch).toHaveBeenCalled();
    });

    it('should dedupe reactions', async () => {
        const mockReaction = {
            emoji: { name: '🗑️' },
            message: { id: 'msg123', guild: {} },
            partial: false,
        } as MessageReaction;
        const mockUser = { id: 'user123', bot: false, partial: false } as User;

        mockDb.select().from().where().limit().execute.mockResolvedValue([{
            id: 1,
            webhookMessageId: 'msg123',
            actorUserId: 'user123',
        }]);

        // First reaction
        await client.emit('messageReactionAdd', mockReaction, mockUser);
        expect(mockDeleteService.deleteProxied).toHaveBeenCalledTimes(1);

        // Second reaction (should be ignored)
        await client.emit('messageReactionAdd', mockReaction, mockUser);
        expect(mockDeleteService.deleteProxied).toHaveBeenCalledTimes(1);
    });

    it('should ignore non-proxied messages', async () => {
        const mockReaction = {
            emoji: { name: '🗑️' },
            message: { id: 'msg123', guild: {} },
            partial: false,
        } as MessageReaction;
        const mockUser = { id: 'user123', bot: false, partial: false } as User;

        mockDb.select().from().where().limit().execute.mockResolvedValue([]);

        await client.emit('messageReactionAdd', mockReaction, mockUser);

        expect(mockDeleteService.deleteProxied).not.toHaveBeenCalled();
    });

    it('should authorize actor who owns the message', async () => {
        const mockReaction = {
            emoji: { name: '🗑️' },
            message: { id: 'msg123', guild: {}, channel: {} },
            partial: false,
        } as MessageReaction;
        const mockUser = { id: 'user123', bot: false, partial: false } as User;

        mockDb.select().from().where().limit().execute.mockResolvedValue([{
            id: 1,
            webhookMessageId: 'msg123',
            actorUserId: 'user123',
        }]);
        mockDeleteService.deleteProxied.mockResolvedValue({ ok: true });

        await client.emit('messageReactionAdd', mockReaction, mockUser);

        expect(mockDeleteService.deleteProxied).toHaveBeenCalledWith({
            channel: mockReaction.message.channel,
            messageId: 'msg123',
            actorUserId: 'user123',
        });
    });

    it('should authorize actor with ManageMessages permission', async () => {
        const mockReaction = {
            emoji: { name: '🗑️' },
            message: { id: 'msg123', guild: { members: { fetch: vi.fn() } }, channel: {} },
            partial: false,
        } as MessageReaction;
        const mockUser = { id: 'user456', bot: false, partial: false } as User;
        const mockMember = {
            permissionsIn: vi.fn().mockReturnValue({
                has: vi.fn().mockReturnValue(true),
            }),
        };

        mockReaction.message.guild.members.fetch.mockResolvedValue(mockMember);
        mockDb.select().from().where().limit().execute.mockResolvedValue([{
            id: 1,
            webhookMessageId: 'msg123',
            actorUserId: 'user123',
        }]);
        mockDeleteService.deleteProxied.mockResolvedValue({ ok: true });

        await client.emit('messageReactionAdd', mockReaction, mockUser);

        expect(mockMember.permissionsIn).toHaveBeenCalledWith(mockReaction.message.channel);
        expect(mockDeleteService.deleteProxied).toHaveBeenCalledWith({
            channel: mockReaction.message.channel,
            messageId: 'msg123',
            actorUserId: 'user456',
        });
    });

    it('should ignore unauthorized actors', async () => {
        const mockReaction = {
            emoji: { name: '🗑️' },
            message: { id: 'msg123', guild: { members: { fetch: vi.fn() } }, channel: {} },
            partial: false,
        } as MessageReaction;
        const mockUser = { id: 'user456', bot: false, partial: false } as User;
        const mockMember = {
            permissionsIn: vi.fn().mockReturnValue({
                has: vi.fn().mockReturnValue(false),
            }),
        };

        mockReaction.message.guild.members.fetch.mockResolvedValue(mockMember);
        mockDb.select().from().where().limit().execute.mockResolvedValue([{
            id: 1,
            webhookMessageId: 'msg123',
            actorUserId: 'user123',
        }]);

        await client.emit('messageReactionAdd', mockReaction, mockUser);

        expect(mockDeleteService.deleteProxied).not.toHaveBeenCalled();
    });

    it('should handle errors silently', async () => {
        const mockReaction = {
            emoji: { name: '🗑️' },
            message: { id: 'msg123', guild: {}, channel: {} },
            partial: false,
        } as MessageReaction;
        const mockUser = { id: 'user123', bot: false, partial: false } as User;

        mockDb.select().from().where().limit().execute.mockRejectedValue(new Error('DB error'));

        // Should not throw
        await expect(client.emit('messageReactionAdd', mockReaction, mockUser)).resolves.toBeUndefined();
    });
});