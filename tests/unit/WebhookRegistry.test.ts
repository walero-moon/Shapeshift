import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookRegistry } from '../../src/discord/services/WebhookRegistry';
import { GuildTextBasedChannel, Webhook } from 'discord.js';

describe('WebhookRegistry', () => {
    let registry: WebhookRegistry;
    let mockChannel: GuildTextBasedChannel;
    let mockGuild: any;
    let mockWebhook: Webhook;

    beforeEach(() => {
        registry = new WebhookRegistry();
        mockWebhook = {
            id: 'webhook123',
            token: 'token123',
            owner: { id: 'bot123' },
            channelId: 'channel123',
        } as any;

        mockGuild = {
            id: 'guild123',
            members: { me: { id: 'bot123' } },
            fetchWebhooks: vi.fn(),
        };

        mockChannel = {
            id: 'channel123',
            guild: mockGuild,
            createWebhook: vi.fn(),
        } as any;
    });

    describe('getOrCreate', () => {
        it('should return cached webhook if exists', async () => {
            const cached = { id: 'cached123', token: 'cachedtoken' };
            (registry as any).cache.set('channel123', cached);

            const result = await registry.getOrCreate(mockChannel);
            expect(result).toEqual(cached);
        });

        it('should reuse existing bot-owned webhook', async () => {
            mockGuild.fetchWebhooks.mockResolvedValue([mockWebhook]);

            const result = await registry.getOrCreate(mockChannel);
            expect(result).toEqual({ id: 'webhook123', token: 'token123' });
            expect(mockGuild.fetchWebhooks).toHaveBeenCalled();
            expect(mockChannel.createWebhook).not.toHaveBeenCalled();
        });

        it('should create new webhook if none exists', async () => {
            mockGuild.fetchWebhooks.mockResolvedValue([]);
            mockChannel.createWebhook.mockResolvedValue(mockWebhook);

            const result = await registry.getOrCreate(mockChannel);
            expect(result).toEqual({ id: 'webhook123', token: 'token123' });
            expect(mockGuild.fetchWebhooks).toHaveBeenCalled();
            expect(mockChannel.createWebhook).toHaveBeenCalledWith({
                name: 'Shapeshift Proxy',
                reason: 'Created by Shapeshift for proxying messages'
            });
        });

        it('should cache the result', async () => {
            mockGuild.fetchWebhooks.mockResolvedValue([mockWebhook]);

            await registry.getOrCreate(mockChannel);
            const cached = (registry as any).cache.get('channel123');
            expect(cached).toEqual({ id: 'webhook123', token: 'token123' });
        });
    });
});