import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiscordChannelProxy } from '../../../adapters/discord/DiscordChannelProxy';
import { MessageMentionOptions } from 'discord.js';

// Mock discord.js client and related modules
vi.mock('discord.js', () => ({
    Routes: {
        webhookExecute: vi.fn((webhookId, token) => `webhooks/${webhookId}/${token}`),
        webhookMessage: vi.fn((webhookId, token, messageId) => `webhooks/${webhookId}/${token}/messages/${messageId}`),
    },
    Webhook: vi.fn(),
}));

vi.mock('timers/promises', () => ({
    setTimeout: vi.fn(),
}));

vi.mock('../../../adapters/discord/client', () => ({
    client: {
        channels: {
            fetch: vi.fn(),
        },
        rest: {
            get: vi.fn(),
            post: vi.fn(),
            patch: vi.fn(),
            delete: vi.fn(),
        },
        application: {
            id: 'app123',
        },
    },
}));

// Import after mocking
import { client } from '../../../adapters/discord/client';
import { setTimeout } from 'timers/promises';

interface MockTextChannel {
    createWebhook: ReturnType<typeof vi.fn>;
    isTextBased: ReturnType<typeof vi.fn>;
}

interface MockWebhook {
    id: string;
    token: string;
}

interface WebhookBody {
    content: string;
    username: string;
    avatar_url?: string;
    allowed_mentions: MessageMentionOptions;
    files: unknown[];
    wait: boolean;
}

describe('DiscordChannelProxy', () => {
    let proxy: DiscordChannelProxy;
    let mockChannel: MockTextChannel;
    let mockWebhook: MockWebhook;

    beforeEach(() => {
        vi.clearAllMocks();
        // Mock the webhook registry
        const mockWebhookRegistry = {
            getWebhook: vi.fn().mockResolvedValue({ id: 'webhook456', token: 'token789' })
        };
        Object.defineProperty(DiscordChannelProxy, 'webhookRegistry', {
            value: mockWebhookRegistry,
            writable: true
        });
        proxy = new DiscordChannelProxy('channel123');

        mockChannel = {
            createWebhook: vi.fn(),
            isTextBased: vi.fn().mockReturnValue(true),
        };

        mockWebhook = {
            id: 'webhook456',
            token: 'token789',
        };

        vi.mocked(client.channels.fetch).mockResolvedValue(mockChannel as unknown as any);
        vi.mocked(mockChannel.createWebhook).mockResolvedValue(mockWebhook);
        vi.mocked(client.rest.get).mockResolvedValue([]);
        vi.mocked(client.rest.post).mockResolvedValue({ id: 'webhook456', token: 'token789' });
    });

    describe('send method', () => {
        it('should send message successfully with wait=true', async () => {
            const mockMessageResponse = { id: 'msg123' };
            vi.mocked(client.rest.post).mockResolvedValue(mockMessageResponse);

            const result = await proxy.send({
                username: 'TestUser',
                content: 'Hello world',
                avatarUrl: 'https://example.com/avatar.png' as string,
                allowedMentions: { parse: [], repliedUser: false },
                attachments: [],
            });

            expect(result).toEqual({
                webhookId: 'webhook456',
                webhookToken: 'token789',
                messageId: 'msg123',
            });

            expect(client.channels.fetch).toHaveBeenCalledWith('channel123');
            expect(mockChannel.createWebhook).toHaveBeenCalledWith({
                name: 'Shapeshift Proxy',
                reason: 'Temporary webhook for message proxying',
            });
            expect(client.rest.post).toHaveBeenCalledWith('/webhooks/webhook456/token789?wait=true', {
                body: {
                    content: 'Hello world',
                    username: 'TestUser',
                    avatar_url: 'https://example.com/avatar.png',
                    allowed_mentions: { parse: [], repliedUser: false },
                    files: [],
                },
            });
        });

        it('should truncate content to 2000 characters', async () => {
            const longContent = 'a'.repeat(2500);
            const mockWebhookResponse = { id: 'webhook456', token: 'token789' };
            const mockMessageResponse = { id: 'msg123' };
            vi.mocked(client.rest.post).mockResolvedValueOnce(mockWebhookResponse).mockResolvedValueOnce(mockMessageResponse);

            await proxy.send({
                username: 'TestUser',
                content: longContent,
                allowedMentions: { parse: [], repliedUser: false },
                attachments: [],
            });

            const callArgs = vi.mocked(client.rest.post).mock.calls[0]?.[1];
            if (callArgs) {
                const body = callArgs.body as WebhookBody;
                expect(body.content.length).toBe(2000);
                expect(body.content).toBeDefined();
                expect(typeof body.content).toBe('string');
                expect(body.content).toBe('a'.repeat(2000));
            } else {
                throw new Error('Expected callArgs to be defined');
            }
        });

        it('should handle 429 rate limit by retrying', async () => {
            const mockError = { code: 429, retry_after: 1000 };
            const mockMessageResponse = { id: 'msg123' };

            vi.mocked(client.rest.post)
                .mockRejectedValueOnce(mockError)
                .mockResolvedValueOnce(mockMessageResponse);

            await proxy.send({
                username: 'TestUser',
                content: 'Hello world',
                allowedMentions: { parse: [], repliedUser: false },
                attachments: [],
            });

            expect(setTimeout).toHaveBeenCalledWith(1000);
            expect(client.rest.post).toHaveBeenCalledTimes(2);
        });

        it('should throw after max retries on 429', async () => {
            const mockError = { code: 429, retry_after: 1000 };

            vi.mocked(client.rest.post).mockRejectedValue(mockError);

            await expect(proxy.send({
                username: 'TestUser',
                content: 'Hello world',
                allowedMentions: { parse: [], repliedUser: false },
                attachments: [],
            })).rejects.toThrow('Max retries exceeded for Discord API call');

            expect(client.rest.post).toHaveBeenCalledTimes(3);
        });

        it('should throw on non-text channel', async () => {
            mockChannel.isTextBased.mockReturnValue(false);

            await expect(proxy.send({
                username: 'TestUser',
                content: 'Hello world',
                allowedMentions: { parse: [], repliedUser: false },
                attachments: [],
            })).rejects.toThrow('Invalid or non-text channel');
        });

        it('should throw on webhook creation failure', async () => {
            // Mock webhookRegistry to throw
            const mockWebhookRegistry = {
                getWebhook: vi.fn().mockRejectedValue(new Error('Webhook creation failed'))
            };
            Object.defineProperty(DiscordChannelProxy, 'webhookRegistry', {
                value: mockWebhookRegistry,
                writable: true
            });

            await expect(proxy.send({
                username: 'TestUser',
                content: 'Hello world',
                allowedMentions: { parse: [], repliedUser: false },
                attachments: [],
            })).rejects.toThrow('Webhook creation failed');
        });

        it('should throw on webhook execution failure', async () => {
            vi.mocked(client.rest.post).mockResolvedValue({ id: 'webhook456', token: 'token789' }).mockRejectedValueOnce(new Error('Webhook execution failed'));

            await expect(proxy.send({
                username: 'TestUser',
                content: 'Hello world',
                allowedMentions: { parse: [], repliedUser: false },
                attachments: [],
            })).rejects.toThrow('Webhook execution failed');
        });

        it('should handle fetch failure gracefully for reply-style', async () => {
            const mockWebhookResponse = { id: 'webhook456', token: 'token789' };
            const mockMessageResponse = { id: 'msg123' };
            vi.mocked(client.rest.post).mockResolvedValueOnce(mockWebhookResponse).mockResolvedValueOnce(mockMessageResponse);

            // Mock channel fetch to fail
            vi.mocked(client.channels.fetch).mockRejectedValue(new Error('Channel fetch failed'));

            const result = await proxy.send({
                username: 'TestUser',
                content: 'Hello world',
                allowedMentions: { parse: [], repliedUser: false },
                attachments: [],
            }, { guildId: 'guild123', channelId: 'channel456', messageId: 'msg789' });

            // Should still succeed but without reply-style
            expect(result).toEqual({
                webhookId: 'webhook456',
                webhookToken: 'token789',
                messageId: 'msg123',
            });

            // Verify webhook payload doesn't include reply-style components
            const webhookCall = vi.mocked(client.rest.post).mock.calls[1];
            expect(webhookCall).toBeDefined();
            if (webhookCall) {
                const payload = webhookCall[1]?.body as any;
                expect(payload.content).toBe('Hello world'); // No header/quote
                expect(payload.components).toEqual([]); // No jump button
            }
        });
    });

    describe('edit method', () => {
        it('should edit message successfully', async () => {
            vi.mocked(client.rest.patch).mockResolvedValue(undefined);

            await proxy.edit('webhook456', 'token789', 'msg123', {
                content: 'Updated content',
                allowedMentions: { parse: [], repliedUser: false },
                attachments: [],
            });

            expect(client.rest.patch).toHaveBeenCalledWith('/webhooks/webhook456/token789/messages/msg123', {
                body: {
                    content: 'Updated content',
                    allowed_mentions: { parse: [], repliedUser: false },
                    files: [],
                },
            });
        });

        it('should truncate content to 2000 characters on edit', async () => {
            const longContent = 'a'.repeat(2500);
            vi.mocked(client.rest.patch).mockResolvedValue(undefined);

            await proxy.edit('webhook456', 'token789', 'msg123', {
                content: longContent,
                allowedMentions: { parse: [], repliedUser: false },
                attachments: [],
            });

            const callArgs = vi.mocked(client.rest.patch).mock.calls[0]?.[1];
            if (callArgs) {
                const body = callArgs.body as WebhookBody;
                expect(body.content.length).toBe(2000);
                expect(body.content).toBeDefined();
                expect(typeof body.content).toBe('string');
                expect(body.content).toBe('a'.repeat(2000));
            } else {
                throw new Error('Expected callArgs to be defined');
            }
        });

        it('should handle 429 rate limit by retrying on edit', async () => {
            const mockError = { code: 429, retry_after: 500 };
            vi.mocked(client.rest.patch)
                .mockRejectedValueOnce(mockError)
                .mockResolvedValueOnce(undefined);

            await proxy.edit('webhook456', 'token789', 'msg123', {
                content: 'Updated content',
                allowedMentions: { parse: [], repliedUser: false },
                attachments: [],
            });

            expect(setTimeout).toHaveBeenCalledWith(500);
            expect(client.rest.patch).toHaveBeenCalledTimes(2);
        });
    });

    describe('delete method', () => {
        it('should delete message successfully', async () => {
            vi.mocked(client.rest.delete).mockResolvedValue(undefined);

            await proxy.delete('webhook456', 'token789', 'msg123');

            expect(client.rest.delete).toHaveBeenCalledWith('/webhooks/webhook456/token789/messages/msg123');
        });

        it('should handle 429 rate limit by retrying on delete', async () => {
            const mockError = { code: 429, retry_after: 2000 };
            vi.mocked(client.rest.delete)
                .mockRejectedValueOnce(mockError)
                .mockResolvedValueOnce(undefined);

            await proxy.delete('webhook456', 'token789', 'msg123');

            expect(setTimeout).toHaveBeenCalledWith(2000);
            expect(client.rest.delete).toHaveBeenCalledTimes(2);
        });
    });
});