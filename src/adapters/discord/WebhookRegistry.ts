import { Routes, APIWebhook } from 'discord-api-types/v10';
import { client } from './client';
import log, { type LogContext } from '../../shared/utils/logger';

export class WebhookRegistry {
    private cache = new Map<string, Promise<{ id: string; token: string }>>();

    async getWebhook(channelId: string): Promise<{ id: string; token: string }> {
        if (this.cache.has(channelId)) {
            return this.cache.get(channelId)!;
        }

        const promise = this.resolveWebhook(channelId);
        this.cache.set(channelId, promise);
        return promise;
    }

    private async resolveWebhook(channelId: string): Promise<{ id: string; token: string }> {
        const context: LogContext = {
            component: 'WebhookRegistry',
            channelId,
            route: 'resolveWebhook'
        };

        try {
            log.info('Attempting to get existing webhooks for channel', {
                ...context,
                status: 'webhook_lookup_start'
            });

            // GET /channels/{id}/webhooks
            const webhooks = await client.rest.get(Routes.channelWebhooks(channelId)) as APIWebhook[];

            const appId = client.application!.id;
            // Create unique webhook name per bot instance using last 4 chars of app ID
            const baseName = 'Shapeshift Proxy';
            const uniqueName = `${baseName} ${appId.slice(-4)}`;

            log.info('Retrieved webhooks, searching for bot-specific webhook', {
                ...context,
                webhookCount: webhooks.length,
                appId,
                uniqueName,
                status: 'webhook_lookup_complete'
            });

            // Look for webhook created by this specific bot instance
            let webhook = webhooks.find(w => w.application_id === appId && w.name === uniqueName);

            if (!webhook) {
                log.info('No bot-specific webhook found, creating new one', {
                    ...context,
                    uniqueName,
                    status: 'webhook_creation_start'
                });

                // POST /channels/{id}/webhooks
                webhook = await client.rest.post(Routes.channelWebhooks(channelId), {
                    body: {
                        name: uniqueName,
                        reason: 'Persistent webhook for Shapeshift proxying'
                    }
                }) as APIWebhook;

                log.info('Bot-specific webhook created successfully', {
                    ...context,
                    webhookId: webhook?.id,
                    webhookName: webhook?.name,
                    hasToken: !!webhook?.token,
                    status: 'webhook_creation_complete'
                });
            } else {
                log.info('Found existing bot-specific webhook', {
                    ...context,
                    webhookId: webhook.id,
                    webhookName: webhook.name,
                    hasToken: !!webhook.token,
                    status: 'webhook_found'
                });
            }

            if (!webhook || !webhook.token) {
                log.error('Webhook creation failed or missing token', {
                    ...context,
                    webhookExists: !!webhook,
                    hasToken: webhook ? !!webhook.token : false,
                    status: 'webhook_invalid'
                });
                throw new Error('Failed to create or retrieve webhook with token');
            }

            return { id: webhook.id, token: webhook.token };
        } catch (error) {
            log.error('Failed to resolve webhook', {
                ...context,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                status: 'webhook_error'
            });
            throw error;
        }
    }
}