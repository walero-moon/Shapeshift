import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogService } from '../../src/discord/services/LogService';
import { client } from '../../src/discord/client';
import { db } from '../../src/db/client';
import { members } from '../../src/db/schema';

vi.mock('../../src/discord/client', () => ({
    client: {
        channels: {
            fetch: vi.fn(),
        },
    },
}));

vi.mock('../../src/db/client', () => ({
    db: {
        select: vi.fn(),
    },
}));

describe('LogService', () => {
    let service: LogService;

    beforeEach(() => {
        service = new LogService();
        vi.clearAllMocks();
    });

    describe('logProxy', () => {
        it('should not log if no log channel configured', async () => {
            const mockGuildConfigService = {
                get: vi.fn().mockResolvedValue({ logChannelId: null }),
            };
            (service as any).guildConfigService = mockGuildConfigService;

            await service.logProxy({
                guildId: '123',
                actorUserId: '456',
                memberId: 1,
                channelId: '789',
                originalMessageId: '101',
                webhookMessageId: '202',
            });

            expect(mockGuildConfigService.get).toHaveBeenCalledWith('123');
            expect(client.channels.fetch).not.toHaveBeenCalled();
        });

        it('should not log if member not found', async () => {
            const mockGuildConfigService = {
                get: vi.fn().mockResolvedValue({ logChannelId: 'log123' }),
            };
            (service as any).guildConfigService = mockGuildConfigService;

            (db.select as any).mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([]),
                    }),
                }),
            });

            await service.logProxy({
                guildId: '123',
                actorUserId: '456',
                memberId: 1,
                channelId: '789',
                originalMessageId: '101',
                webhookMessageId: '202',
            });

            expect(client.channels.fetch).not.toHaveBeenCalled();
        });

        it('should log proxy event with embed and empty allowed_mentions', async () => {
            const mockGuildConfigService = {
                get: vi.fn().mockResolvedValue({ logChannelId: 'log123' }),
            };
            (service as any).guildConfigService = mockGuildConfigService;

            (db.select as any).mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([{ name: 'TestMember' }]),
                    }),
                }),
            });

            const mockChannel = {
                isTextBased: vi.fn().mockReturnValue(true),
                send: vi.fn().mockResolvedValue(undefined),
            };
            (client.channels.fetch as any).mockResolvedValue(mockChannel);

            await service.logProxy({
                guildId: '123',
                actorUserId: '456',
                memberId: 1,
                channelId: '789',
                originalMessageId: '101',
                webhookMessageId: '202',
            });

            expect(mockChannel.send).toHaveBeenCalledWith({
                embeds: [expect.any(Object)],
                allowedMentions: { parse: [] },
            });
        });

        it('should handle errors gracefully', async () => {
            const mockGuildConfigService = {
                get: vi.fn().mockRejectedValue(new Error('Config error')),
            };
            (service as any).guildConfigService = mockGuildConfigService;

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            await service.logProxy({
                guildId: '123',
                actorUserId: '456',
                memberId: 1,
                channelId: '789',
                originalMessageId: '101',
                webhookMessageId: '202',
            });

            expect(consoleSpy).toHaveBeenCalledWith('Failed to log proxy event:', expect.any(Error));
            consoleSpy.mockRestore();
        });
    });

    describe('logDelete', () => {
        it('should not log if no log channel configured', async () => {
            const mockGuildConfigService = {
                get: vi.fn().mockResolvedValue({ logChannelId: null }),
            };
            (service as any).guildConfigService = mockGuildConfigService;

            await service.logDelete({
                guildId: '123',
                actorUserId: '456',
                memberId: 1,
                channelId: '789',
                webhookMessageId: '202',
            });

            expect(mockGuildConfigService.get).toHaveBeenCalledWith('123');
            expect(client.channels.fetch).not.toHaveBeenCalled();
        });

        it('should not log if member not found', async () => {
            const mockGuildConfigService = {
                get: vi.fn().mockResolvedValue({ logChannelId: 'log123' }),
            };
            (service as any).guildConfigService = mockGuildConfigService;

            (db.select as any).mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([]),
                    }),
                }),
            });

            await service.logDelete({
                guildId: '123',
                actorUserId: '456',
                memberId: 1,
                channelId: '789',
                webhookMessageId: '202',
            });

            expect(client.channels.fetch).not.toHaveBeenCalled();
        });

        it('should log delete event with embed and empty allowed_mentions', async () => {
            const mockGuildConfigService = {
                get: vi.fn().mockResolvedValue({ logChannelId: 'log123' }),
            };
            (service as any).guildConfigService = mockGuildConfigService;

            (db.select as any).mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([{ name: 'TestMember' }]),
                    }),
                }),
            });

            const mockChannel = {
                isTextBased: vi.fn().mockReturnValue(true),
                send: vi.fn().mockResolvedValue(undefined),
            };
            (client.channels.fetch as any).mockResolvedValue(mockChannel);

            await service.logDelete({
                guildId: '123',
                actorUserId: '456',
                memberId: 1,
                channelId: '789',
                webhookMessageId: '202',
            });

            expect(mockChannel.send).toHaveBeenCalledWith({
                embeds: [expect.any(Object)],
                allowedMentions: { parse: [] },
            });
        });

        it('should handle errors gracefully', async () => {
            const mockGuildConfigService = {
                get: vi.fn().mockRejectedValue(new Error('Config error')),
            };
            (service as any).guildConfigService = mockGuildConfigService;

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

            await service.logDelete({
                guildId: '123',
                actorUserId: '456',
                memberId: 1,
                channelId: '789',
                webhookMessageId: '202',
            });

            expect(consoleSpy).toHaveBeenCalledWith('Failed to log delete event:', expect.any(Error));
            consoleSpy.mockRestore();
        });
    });
});