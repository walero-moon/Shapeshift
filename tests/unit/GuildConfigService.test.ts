import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GuildConfigService } from '../../src/discord/services/GuildConfigService';
import { db } from '../../src/db/client';
import { guildConfigs } from '../../src/db/schema';

vi.mock('../../src/db/client', () => ({
    db: {
        select: vi.fn(),
        insert: vi.fn(),
    },
}));

describe('GuildConfigService', () => {
    let service: GuildConfigService;

    beforeEach(() => {
        service = new GuildConfigService();
        vi.clearAllMocks();
    });

    describe('get', () => {
        it('should return existing config', async () => {
            const mockResult = [{
                guildId: '123',
                logChannelId: '456',
                deleteOriginalOnProxy: 1,
                tagProxyEnabled: 0,
            }];
            (db.select as any).mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue(mockResult),
                    }),
                }),
            });

            const result = await service.get('123');

            expect(result).toEqual({
                guildId: '123',
                logChannelId: '456',
                deleteOriginalOnProxy: true,
                tagProxyEnabled: false,
            });
        });

        it('should return defaults when no config exists', async () => {
            (db.select as any).mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([]),
                    }),
                }),
            });

            const result = await service.get('123');

            expect(result).toEqual({
                guildId: '123',
                logChannelId: null,
                deleteOriginalOnProxy: false,
                tagProxyEnabled: false,
            });
        });
    });

    describe('setLogChannel', () => {
        it('should insert or update log channel', async () => {
            const mockInsert = vi.fn().mockReturnValue({
                values: vi.fn().mockReturnValue({
                    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
                }),
            });
            (db.insert as any).mockReturnValue(mockInsert);

            await service.setLogChannel('123', '456');

            expect(db.insert).toHaveBeenCalledWith(guildConfigs);
            expect(mockInsert.values).toHaveBeenCalledWith({ guildId: '123', logChannelId: '456' });
        });
    });

    describe('setDeleteOriginal', () => {
        it('should set delete original to true', async () => {
            const mockInsert = vi.fn().mockReturnValue({
                values: vi.fn().mockReturnValue({
                    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
                }),
            });
            (db.insert as any).mockReturnValue(mockInsert);

            await service.setDeleteOriginal('123', true);

            expect(mockInsert.values).toHaveBeenCalledWith({ guildId: '123', deleteOriginalOnProxy: 1 });
        });

        it('should set delete original to false', async () => {
            const mockInsert = vi.fn().mockReturnValue({
                values: vi.fn().mockReturnValue({
                    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
                }),
            });
            (db.insert as any).mockReturnValue(mockInsert);

            await service.setDeleteOriginal('123', false);

            expect(mockInsert.values).toHaveBeenCalledWith({ guildId: '123', deleteOriginalOnProxy: 0 });
        });
    });

    describe('setTagProxyEnabled', () => {
        it('should set tag proxy enabled to true', async () => {
            const mockInsert = vi.fn().mockReturnValue({
                values: vi.fn().mockReturnValue({
                    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
                }),
            });
            (db.insert as any).mockReturnValue(mockInsert);

            await service.setTagProxyEnabled('123', true);

            expect(mockInsert.values).toHaveBeenCalledWith({ guildId: '123', tagProxyEnabled: 1 });
        });

        it('should set tag proxy enabled to false', async () => {
            const mockInsert = vi.fn().mockReturnValue({
                values: vi.fn().mockReturnValue({
                    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
                }),
            });
            (db.insert as any).mockReturnValue(mockInsert);

            await service.setTagProxyEnabled('123', false);

            expect(mockInsert.values).toHaveBeenCalledWith({ guildId: '123', tagProxyEnabled: 0 });
        });
    });
});