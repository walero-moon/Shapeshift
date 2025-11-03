import { GuildTextBasedChannel } from 'discord.js';

export class WebhookRegistry {
    private cache = new Map<string, { id: string; token: string }>();

    /**
     * Gets or creates a webhook for the given channel, caching the result.
     * Reuses existing bot-owned webhooks or creates a new one named "Shapeshift Proxy".
     * @param channel The channel to get/create webhook for
     * @returns Promise resolving to webhook id and token
     */
    async getOrCreate(channel: GuildTextBasedChannel): Promise<{ id: string; token: string }> {
        const channelId = channel.id;

        if (this.cache.has(channelId)) {
            return this.cache.get(channelId)!;
        }

        // Fetch all webhooks for the guild
        const webhooks = await channel.guild.fetchWebhooks();

        // Find existing webhook owned by the bot in this channel
        const botWebhook = webhooks.find(
            (wh: any) => wh.owner?.id === channel.guild.members.me?.id && wh.channelId === channelId
        );

        if (botWebhook) {
            const result = { id: botWebhook.id, token: botWebhook.token! };
            this.cache.set(channelId, result);
            return result;
        }

        // Create new webhook if none exists
        const newWebhook = await (channel as any).createWebhook({
            name: 'Shapeshift Proxy',
            reason: 'Created by Shapeshift for proxying messages'
        });

        const result = { id: newWebhook.id, token: newWebhook.token! };
        this.cache.set(channelId, result);
        return result;
    }
}