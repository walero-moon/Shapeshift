import { Routes } from 'discord-api-types/v10';
import { TextChannel, Webhook } from 'discord.js';
import { setTimeout } from 'timers/promises';
import { client } from './client';
import { ChannelProxyPort, SendMessageData, EditMessageData } from '../../shared/ports/ChannelProxyPort';
import { handleWebhookError } from '../../shared/utils/errorHandling';
import log, { type LogContext } from '../../shared/utils/logger';

export class DiscordChannelProxy implements ChannelProxyPort {
    private channelId: string;

    constructor(channelId: string) {
        this.channelId = channelId;
    }

    async send(data: SendMessageData): Promise<{ webhookId: string; webhookToken: string; messageId: string }> {
        const context: LogContext = {
            component: 'DiscordChannelProxy',
            channelId: this.channelId,
            route: 'send'
        };

        // For send, we need the result, so we don't use handleWebhookError as it can return undefined
        try {
            // Create temporary webhook for this message
            const channel = await client.channels.fetch(this.channelId) as TextChannel;
            if (!channel?.isTextBased()) {
                throw new Error('Invalid or non-text channel');
            }

            const webhook = await this.executeWithRetry(() =>
                channel.createWebhook({
                    name: 'Shapeshift Proxy',
                    reason: 'Temporary webhook for message proxying'
                })
            ) as Webhook;

            // Execute webhook with message data
            const result = await this.executeWithRetry(() =>
                client.rest.post(`/webhooks/${webhook.id}/${webhook.token!}`, {
                    body: {
                        content: data.content.length > 2000 ? data.content.slice(0, 2000) : data.content,
                        username: data.username,
                        avatar_url: data.avatarUrl,
                        allowed_mentions: data.allowedMentions,
                        files: data.attachments,
                        wait: true
                    }
                })
            ) as { id: string }; // Discord API response for webhook execute with wait=true

            return {
                webhookId: webhook.id,
                webhookToken: webhook.token!,
                messageId: result.id
            };
        } catch (error) {
            // Log the error but re-throw since send must succeed or fail
            log.error('Webhook send operation failed', {
                ...context,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                status: 'webhook_error'
            });
            throw error;
        }
    }

    async edit(webhookId: string, webhookToken: string, messageId: string, data: EditMessageData): Promise<void> {
        const context: LogContext = {
            component: 'DiscordChannelProxy',
            channelId: this.channelId,
            route: 'edit'
        };

        return handleWebhookError(async () => {
            await this.executeWithRetry(() =>
                client.rest.patch(Routes.webhookMessage(webhookId, webhookToken, messageId), {
                    body: {
                        content: data.content.length > 2000 ? data.content.slice(0, 2000) : data.content,
                        allowed_mentions: data.allowedMentions,
                        files: data.attachments
                    }
                })
            );
        }, context);
    }

    async delete(webhookId: string, webhookToken: string, messageId: string): Promise<void> {
        const context: LogContext = {
            component: 'DiscordChannelProxy',
            channelId: this.channelId,
            route: 'delete'
        };

        return handleWebhookError(async () => {
            await this.executeWithRetry(() =>
                client.rest.delete(Routes.webhookMessage(webhookId, webhookToken, messageId))
            );
        }, context);
    }

    private async executeWithRetry<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error: unknown) {
                if (typeof error === 'object' && error !== null && 'code' in error && error.code === 429) {
                    const retryAfter = 'retry_after' in error ? (error.retry_after as number) : 1000;
                    await setTimeout(retryAfter);
                    continue;
                }
                throw error;
            }
        }
        throw new Error('Max retries exceeded for Discord API call');
    }
}