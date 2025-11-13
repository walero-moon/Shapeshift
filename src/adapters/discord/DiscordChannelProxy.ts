import { Routes } from 'discord-api-types/v10';
import { setTimeout } from 'timers/promises';
import { client } from './client';
import { ChannelProxyPort, SendMessageData, EditMessageData, ProxyAttachment } from '../../shared/ports/ChannelProxyPort';
import { handleWebhookError, handleDegradedModeError } from '../../shared/utils/errorHandling';
import log, { type LogContext } from '../../shared/utils/logger';
import { WebhookRegistry } from './WebhookRegistry';
import { buildReplyStyle } from '../../features/proxy/app/BuildReplyStyle';
import { assembleWebhookPayload } from '../../features/proxy/discord/send.util';

export class DiscordChannelProxy implements ChannelProxyPort {
    private channelId: string;
    private static webhookRegistry = new WebhookRegistry();

    constructor(channelId: string) {
        this.channelId = channelId;
    }

    async send(data: SendMessageData, replyTo?: { guildId: string; channelId: string; messageId: string } | null): Promise<{ webhookId: string; webhookToken: string; messageId: string }> {
        const context: LogContext = {
            component: 'DiscordChannelProxy',
            channelId: this.channelId,
            route: 'send'
        };

        // For send, we need the result, so we don't use handleWebhookError as it can return undefined
        try {
            // Validate channel is text-based
            const channel = await client.channels.fetch(this.channelId);
            if (!channel?.isTextBased()) {
                throw new Error('Invalid or non-text channel');
            }

            // Get or create persistent webhook for this channel
            const { id: webhookId, token: webhookToken } = await DiscordChannelProxy.webhookRegistry.getWebhook(this.channelId);

            let content = data.content.length > 2000 ? data.content.slice(0, 2000) : data.content;
            let replyStyle = null;

            if (replyTo) {
                log.debug('Processing reply context', {
                    ...context,
                    replyTo,
                    status: 'processing_reply'
                });

                // Fetch target message for reply-style
                const targetMessage = await handleDegradedModeError(
                    async () => {
                        const channel = await client.channels.fetch(replyTo.channelId);
                        if (!channel?.isTextBased()) throw new Error('Channel not found or not text-based');
                        return await channel.messages.fetch(replyTo.messageId);
                    },
                    context,
                    null,
                    'fetch target message for reply'
                );

                log.debug('Target message fetched', {
                    ...context,
                    targetAuthor: targetMessage?.author?.displayName,
                    targetContentLength: targetMessage?.content?.length,
                    hasEmbeds: (targetMessage?.embeds?.length ?? 0) > 0,
                    hasAttachments: (targetMessage?.attachments?.size ?? 0) > 0,
                    status: 'target_message_fetched'
                });

                if (targetMessage) {
                    replyStyle = buildReplyStyle(
                        targetMessage.author?.id || null,
                        targetMessage.url || null,
                        targetMessage.content || '',
                        (targetMessage.embeds?.length ?? 0) > 0,
                        (targetMessage.attachments?.size ?? 0) > 0
                    );

                    log.debug('Reply style built', {
                        ...context,
                        headerLine: replyStyle.headerLine,
                        status: 'reply_style_built'
                    });
                }
            }

            const payload = assembleWebhookPayload(content, replyStyle);

            // Override allowed_mentions for reply-style messages to allow user pings
            const allowedMentions = replyStyle ? replyStyle.allowedMentions : payload.allowedMentions;

            // Convert ProxyAttachment[] to Discord webhook file format
            const webhookFiles = data.attachments?.map((attachment: ProxyAttachment) => ({
                name: attachment.name,
                data: attachment.data
            })) || [];

            // Execute webhook with message data
            const result = await this.executeWithRetry(() =>
                client.rest.post(`/webhooks/${webhookId}/${webhookToken}?wait=true`, {
                    body: {
                        ...payload,
                        username: data.username,
                        avatar_url: data.avatarUrl,
                        allowed_mentions: allowedMentions,
                        files: webhookFiles
                    }
                })
            ) as { id: string }; // Discord API response for webhook execute with wait=true

            return {
                webhookId,
                webhookToken,
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
            // Convert ProxyAttachment[] to Discord webhook file format
            const webhookFiles = data.attachments?.map((attachment: ProxyAttachment) => ({
                name: attachment.name,
                data: attachment.data
            })) || [];

            await this.executeWithRetry(() =>
                client.rest.patch(Routes.webhookMessage(webhookId, webhookToken, messageId), {
                    body: {
                        content: data.content.length > 2000 ? data.content.slice(0, 2000) : data.content,
                        allowed_mentions: data.allowedMentions,
                        files: webhookFiles
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