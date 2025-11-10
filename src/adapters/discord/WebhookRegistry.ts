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
            // GET /channels/{id}/webhooks
            const webhooks = await client.rest.get(Routes.channelWebhooks(channelId)) as APIWebhook[];

            const appId = client.application!.id;
            const name = 'Shapeshift Proxy';

            let webhook = webhooks.find(w => w.application_id === appId || w.name === name);

            if (!webhook) {
                // POST /channels/{id}/webhooks
                webhook = await client.rest.post(Routes.channelWebhooks(channelId), {
                    body: {
                        name,
                        reason: 'Persistent webhook for Shapeshift proxying'
                    }
                }) as APIWebhook;
            }

            if (!webhook || !webhook.token) {
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