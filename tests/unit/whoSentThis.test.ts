import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { context } from '../../src/discord/contexts/whoSentThis';
import { db } from '../../src/db/client';
import { proxiedMessages, members } from '../../src/db/schema';
import { PermissionFlagsBits } from 'discord.js';

vi.mock('../../src/db/client', () => ({
    db: {
        select: vi.fn(),
    },
}));

describe('whoSentThis context menu', () => {
    let mockInteraction: any;

    beforeEach(() => {
        mockInteraction = {
            targetMessage: { id: 'msg123' },
            user: { id: 'user456' },
            channel: {
                guild: {
                    members: {
                        fetch: vi.fn(),
                    },
                },
            },
            client: {
                users: {
                    fetch: vi.fn(),
                },
                channels: {
                    fetch: vi.fn(),
                },
            },
            reply: vi.fn(),
        };
        vi.clearAllMocks();
    });

    describe('permission checks', () => {
        it('should reply with permission error when user lacks ManageMessages', async () => {
            const mockMember = {
                permissionsIn: vi.fn().mockReturnValue({
                    has: vi.fn().mockReturnValue(false),
                }),
            };
            mockInteraction.channel.guild.members.fetch.mockResolvedValue(mockMember);

            await context.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: 'You do not have permission to use this command.',
                ephemeral: true,
            });
        });

        it('should reply with verification error when member fetch fails', async () => {
            mockInteraction.channel.guild.members.fetch.mockRejectedValue(new Error('Fetch failed'));

            await context.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: 'Failed to verify permissions.',
                ephemeral: true,
            });
        });
    });

    describe('database queries', () => {
        beforeEach(() => {
            const mockMember = {
                permissionsIn: vi.fn().mockReturnValue({
                    has: vi.fn().mockReturnValue(true),
                }),
            };
            mockInteraction.channel.guild.members.fetch.mockResolvedValue(mockMember);
        });

        it('should reply with no proxy info when message not found', async () => {
            (db.select as any).mockReturnValue({
                from: vi.fn().mockReturnValue({
                    innerJoin: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                            limit: vi.fn().mockResolvedValue([]),
                        }),
                    }),
                }),
            });

            await context.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: 'No proxy information found for this message.',
                ephemeral: true,
            });
        });

        it('should reply with proxy info when message found', async () => {
            const mockResult = [{
                actorUserId: 'actor789',
                memberName: 'TestMember',
                createdAt: 1640995200, // 2022-01-01 00:00:00 UTC
                channelId: 'chan101',
            }];
            (db.select as any).mockReturnValue({
                from: vi.fn().mockReturnValue({
                    innerJoin: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                            limit: vi.fn().mockResolvedValue(mockResult),
                        }),
                    }),
                }),
            });

            const mockUser = { id: 'actor789' };
            mockInteraction.client.users.fetch.mockResolvedValue(mockUser);

            const mockChannel = { name: 'test-channel' };
            mockInteraction.client.channels.fetch.mockResolvedValue(mockChannel);

            await context.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: expect.stringContaining('**Original Actor:** <@actor789> (actor789)'),
                ephemeral: true,
            });
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: expect.stringContaining('**Member Used:** TestMember'),
                ephemeral: true,
            });
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: expect.stringContaining('**Channel:** #test-channel'),
                ephemeral: true,
            });
        });

        it('should handle channel fetch failure gracefully', async () => {
            const mockResult = [{
                actorUserId: 'actor789',
                memberName: 'TestMember',
                createdAt: 1640995200,
                channelId: 'chan101',
            }];
            (db.select as any).mockReturnValue({
                from: vi.fn().mockReturnValue({
                    innerJoin: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                            limit: vi.fn().mockResolvedValue(mockResult),
                        }),
                    }),
                }),
            });

            const mockUser = { id: 'actor789' };
            mockInteraction.client.users.fetch.mockResolvedValue(mockUser);
            mockInteraction.client.channels.fetch.mockRejectedValue(new Error('Channel fetch failed'));

            await context.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: expect.stringContaining('**Channel:** Unknown channel (chan101)'),
                ephemeral: true,
            });
        });

        it('should handle errors during execution', async () => {
            (db.select as any).mockImplementation(() => {
                throw new Error('Database error');
            });

            await context.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: 'An error occurred: Database error',
                ephemeral: true,
            });
        });
    });
});