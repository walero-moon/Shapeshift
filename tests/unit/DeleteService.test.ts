import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeleteService } from '../../src/discord/services/DeleteService';
import { GuildTextBasedChannel, PermissionsBitField } from 'discord.js';

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
        delete: vi.fn(() => ({
            where: vi.fn(() => ({
                execute: vi.fn(),
            })),
        })),
    },
}));

// Mock discord.js
vi.mock('discord.js', async () => {
    const actual = await vi.importActual('discord.js');
    return {
        ...actual,
        WebhookClient: vi.fn().mockImplementation(() => ({
            deleteMessage: vi.fn(),
        })),
    };
});

describe('DeleteService', () => {
    let deleteService: DeleteService;
    let mockDb: any;
    let mockWebhookClient: any;

    beforeEach(() => {
        vi.clearAllMocks();
        deleteService = new DeleteService();
        mockDb = require('../../src/db/client').db;
        mockWebhookClient = require('discord.js').WebhookClient.mock.results[0]?.value || {};
    });

    describe('deleteProxied', () => {
        let mockChannel: GuildTextBasedChannel;

        beforeEach(() => {
            mockChannel = {
                guild: {
                    members: {
                        fetch: vi.fn(),
                    },
                },
                messages: {
                    fetch: vi.fn(),
                },
            } as any;
        });

        it('should return false if proxied message not found', async () => {
            mockDb.select().from().where().limit().execute.mockResolvedValue([]);

            const result = await deleteService.deleteProxied({
                channel: mockChannel,
                messageId: 'msg123',
                actorUserId: 'user123',
            });

            expect(result.ok).toBe(false);
            expect(result.reason).toBe('Proxied message not found');
        });

        it('should authorize actor if they own the message', async () => {
            mockDb.select().from().where().limit().execute.mockResolvedValue([{
                id: 1,
                webhookMessageId: 'msg123',
                actorUserId: 'user123',
                webhookId: 'wh123',
            }]);
            mockWebhookClient.deleteMessage.mockResolvedValue();

            const result = await deleteService.deleteProxied({
                channel: mockChannel,
                messageId: 'msg123',
                webhookToken: 'token123',
                actorUserId: 'user123',
            });

            expect(result.ok).toBe(true);
            expect(mockWebhookClient.deleteMessage).toHaveBeenCalledWith('msg123');
            expect(mockDb.delete).toHaveBeenCalled();
        });

        it('should authorize actor with ManageMessages permission', async () => {
            mockDb.select().from().where().limit().execute.mockResolvedValue([{
                id: 1,
                webhookMessageId: 'msg123',
                actorUserId: 'otherUser',
                webhookId: 'wh123',
            }]);
            const mockMember = {
                permissionsIn: vi.fn().mockReturnValue({
                    has: vi.fn().mockReturnValue(true),
                }),
            };
            mockChannel.guild.members.fetch.mockResolvedValue(mockMember);
            mockWebhookClient.deleteMessage.mockResolvedValue();

            const result = await deleteService.deleteProxied({
                channel: mockChannel,
                messageId: 'msg123',
                webhookToken: 'token123',
                actorUserId: 'user123',
            });

            expect(result.ok).toBe(true);
            expect(mockMember.permissionsIn).toHaveBeenCalledWith(mockChannel);
            expect(mockWebhookClient.deleteMessage).toHaveBeenCalledWith('msg123');
            expect(mockDb.delete).toHaveBeenCalled();
        });

        it('should return unauthorized if no permission', async () => {
            mockDb.select().from().where().limit().execute.mockResolvedValue([{
                id: 1,
                webhookMessageId: 'msg123',
                actorUserId: 'otherUser',
                webhookId: 'wh123',
            }]);
            const mockMember = {
                permissionsIn: vi.fn().mockReturnValue({
                    has: vi.fn().mockReturnValue(false),
                }),
            };
            vi.mocked(mockChannel.guild.members.fetch).mockResolvedValue(mockMember as any);

            const result = await deleteService.deleteProxied({
                channel: mockChannel,
                messageId: 'msg123',
                actorUserId: 'user123',
            });

            expect(result.ok).toBe(false);
            expect(result.reason).toBe('Unauthorized');
        });

        it('should delete via webhook when token provided', async () => {
            mockDb.select().from().where().limit().execute.mockResolvedValue([{
                id: 1,
                webhookMessageId: 'msg123',
                actorUserId: 'user123',
                webhookId: 'wh123',
            }]);
            mockWebhookClient.deleteMessage.mockResolvedValue();

            const result = await deleteService.deleteProxied({
                channel: mockChannel,
                messageId: 'msg123',
                webhookId: 'wh456',
                webhookToken: 'token123',
                actorUserId: 'user123',
            });

            expect(result.ok).toBe(true);
            expect(require('discord.js').WebhookClient).toHaveBeenCalledWith({ id: 'wh456', token: 'token123' });
            expect(mockWebhookClient.deleteMessage).toHaveBeenCalledWith('msg123');
            expect(mockDb.delete).toHaveBeenCalled();
        });

        it('should delete via bot when no token', async () => {
            mockDb.select().from().where().limit().execute.mockResolvedValue([{
                id: 1,
                webhookMessageId: 'msg123',
                actorUserId: 'user123',
                webhookId: 'wh123',
            }]);
            const mockMessage = { delete: vi.fn() };
            vi.mocked(mockChannel.messages.fetch).mockResolvedValue(mockMessage as any);

            const result = await deleteService.deleteProxied({
                channel: mockChannel,
                messageId: 'msg123',
                actorUserId: 'user123',
            });

            expect(result.ok).toBe(true);
            expect(mockChannel.messages.fetch).toHaveBeenCalledWith('msg123');
            expect(mockMessage.delete).toHaveBeenCalled();
            expect(mockDb.delete).toHaveBeenCalled();
        });

        it('should treat 404 as success', async () => {
            mockDb.select().from().where().limit().execute.mockResolvedValue([{
                id: 1,
                webhookMessageId: 'msg123',
                actorUserId: 'user123',
                webhookId: 'wh123',
            }]);
            const error = { code: 404 };
            mockWebhookClient.deleteMessage.mockRejectedValue(error);

            const result = await deleteService.deleteProxied({
                channel: mockChannel,
                messageId: 'msg123',
                webhookToken: 'token123',
                actorUserId: 'user123',
            });

            expect(result.ok).toBe(true);
            expect(mockDb.delete).toHaveBeenCalled();
        });

        it('should return insufficient permissions on 403', async () => {
            mockDb.select().from().where().limit().execute.mockResolvedValue([{
                id: 1,
                webhookMessageId: 'msg123',
                actorUserId: 'user123',
                webhookId: 'wh123',
            }]);
            const error = { code: 403 };
            mockWebhookClient.deleteMessage.mockRejectedValue(error);

            const result = await deleteService.deleteProxied({
                channel: mockChannel,
                messageId: 'msg123',
                webhookToken: 'token123',
                actorUserId: 'user123',
            });

            expect(result.ok).toBe(false);
            expect(result.reason).toBe('Insufficient permissions');
            expect(mockDb.delete).not.toHaveBeenCalled();
        });

        it('should return failure on other errors', async () => {
            mockDb.select().from().where().limit().execute.mockResolvedValue([{
                id: 1,
                webhookMessageId: 'msg123',
                actorUserId: 'user123',
                webhookId: 'wh123',
            }]);
            const error = { code: 500, message: 'Server error' };
            mockWebhookClient.deleteMessage.mockRejectedValue(error);

            const result = await deleteService.deleteProxied({
                channel: mockChannel,
                messageId: 'msg123',
                webhookToken: 'token123',
                actorUserId: 'user123',
            });

            expect(result.ok).toBe(false);
            expect(result.reason).toBe('Deletion failed: Server error');
            expect(mockDb.delete).not.toHaveBeenCalled();
        });
    });
});