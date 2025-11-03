import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProxyService } from '../../src/discord/services/ProxyService';
import { WebhookRegistry } from '../../src/discord/services/WebhookRegistry';
import { permissionGuard } from '../../src/discord/middleware/permissionGuard';
import { GuildTextBasedChannel, GuildMember } from 'discord.js';

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
        insert: vi.fn(() => ({
            values: vi.fn(() => ({
                execute: vi.fn(),
            })),
        })),
    },
}));

// Mock WebhookRegistry
vi.mock('../../src/discord/services/WebhookRegistry', () => ({
    WebhookRegistry: class {
        getOrCreate = vi.fn();
    },
}));

// Mock WebhookClient
vi.mock('discord.js', async () => {
    const actual = await vi.importActual('discord.js');
    return {
        ...actual,
        WebhookClient: vi.fn().mockImplementation(() => ({
            send: vi.fn(),
        })),
    };
});

// Mock permissionGuard
vi.mock('../../src/discord/middleware/permissionGuard', () => ({
    permissionGuard: vi.fn(),
}));

describe('ProxyService', () => {
    let proxyService: ProxyService;
    let mockRegistry: any;
    let mockDb: any;

    beforeEach(() => {
        vi.clearAllMocks();
        proxyService = new ProxyService();
        mockRegistry = (proxyService as any).webhookRegistry;
        mockDb = require('../../src/db/client').db;
    });

    describe('sendProxied', () => {
        let mockChannel: GuildTextBasedChannel;
        let mockMember: GuildMember;
        let mockWebhookClient: any;

        beforeEach(() => {
            mockChannel = {
                id: 'channel123',
                guild: {
                    members: {
                        fetch: vi.fn(),
                    },
                },
            } as any;

            mockMember = {} as any;

            mockWebhookClient = {
                send: vi.fn(),
            };
        });

        it('should throw error if content is empty', async () => {
            await expect(proxyService.sendProxied({
                actorUserId: 'user123',
                memberId: 1,
                channel: mockChannel,
                content: '',
                originalMessageId: 'msg123',
            })).rejects.toThrow('At least content must be provided');
        });

        it('should throw error if member not found', async () => {
            mockDb.select().from().where().limit().execute.mockResolvedValue([]);

            await expect(proxyService.sendProxied({
                actorUserId: 'user123',
                memberId: 1,
                channel: mockChannel,
                content: 'test',
                originalMessageId: 'msg123',
            })).rejects.toThrow('Member not found');
        });

        it('should throw error if actor does not own the member', async () => {
            mockDb.select()
                .mockReturnValueOnce({
                    from: () => ({
                        where: () => ({
                            limit: () => ({
                                execute: () => [{ name: 'TestMember', avatarUrl: null, systemId: 1 }],
                            }),
                        }),
                    }),
                })
                .mockReturnValueOnce({
                    from: () => ({
                        where: () => ({
                            limit: () => ({
                                execute: () => [{ ownerUserId: 'differentUser' }],
                            }),
                        }),
                    }),
                });

            await expect(proxyService.sendProxied({
                actorUserId: 'user123',
                memberId: 1,
                channel: mockChannel,
                content: 'test',
                originalMessageId: 'msg123',
            })).rejects.toThrow('Actor does not own the member');
        });

        it('should throw error if insufficient permissions', async () => {
            mockDb.select()
                .mockReturnValueOnce({
                    from: () => ({
                        where: () => ({
                            limit: () => ({
                                execute: () => [{ name: 'TestMember', avatarUrl: null, systemId: 1 }],
                            }),
                        }),
                    }),
                })
                .mockReturnValueOnce({
                    from: () => ({
                        where: () => ({
                            limit: () => ({
                                execute: () => [{ ownerUserId: 'user123' }],
                            }),
                        }),
                    }),
                });

            vi.mocked(mockChannel.guild.members.fetch).mockResolvedValue(mockMember as any);
            vi.mocked(permissionGuard).mockReturnValue(null);

            await expect(proxyService.sendProxied({
                actorUserId: 'user123',
                memberId: 1,
                channel: mockChannel,
                content: 'test',
                originalMessageId: 'msg123',
            })).rejects.toThrow('Insufficient permissions to send message');
        });

        it('should successfully send proxied message', async () => {
            const mockWebhook = { id: 'webhook123', token: 'token123' };
            const mockSentMessage = { id: 'sent123' };

            mockDb.select()
                .mockReturnValueOnce({
                    from: () => ({
                        where: () => ({
                            limit: () => ({
                                execute: () => [{ name: 'TestMember', avatarUrl: 'avatar.png', systemId: 1 }],
                            }),
                        }),
                    }),
                })
                .mockReturnValueOnce({
                    from: () => ({
                        where: () => ({
                            limit: () => ({
                                execute: () => [{ ownerUserId: 'user123' }],
                            }),
                        }),
                    }),
                });

            mockChannel.guild.members.fetch.mockResolvedValue(mockMember);
            vi.mocked(permissionGuard).mockReturnValue({
                allowedMentions: { parse: ['users' as any] },
                files: [{ name: 'file.png' }],
                flags: 4,
            });

            mockRegistry.getOrCreate.mockResolvedValue(mockWebhook);
            mockWebhookClient.send.mockResolvedValue(mockSentMessage);

            await proxyService.sendProxied({
                actorUserId: 'user123',
                memberId: 1,
                channel: mockChannel,
                content: 'test content',
                attachments: [{ name: 'file.png' }],
                originalMessageId: 'msg123',
            });

            expect(mockRegistry.getOrCreate).toHaveBeenCalledWith(mockChannel);
            // Note: WebhookClient is mocked at the module level
            expect(mockWebhookClient.send).toHaveBeenCalledWith({
                content: 'test content',
                username: 'TestMember',
                avatarURL: 'avatar.png',
                allowedMentions: { parse: ['users'] },
                files: [{ name: 'file.png' }],
                flags: 4,
            });

            expect(mockDb.insert).toHaveBeenCalledWith(require('../../src/db/schema').proxiedMessages);
        });
    });
});