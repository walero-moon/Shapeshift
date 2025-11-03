import { EmbedBuilder, TextChannel } from 'discord.js';
import { client } from '../client';
import { GuildConfigService } from './GuildConfigService';
import { db } from '../../db/client';
import { members } from '../../db/schema';
import { eq } from 'drizzle-orm';

/**
 * Service for logging moderation events to configured log channels.
 */
export class LogService {
    private guildConfigService = new GuildConfigService();

    /**
     * Logs a successful proxy event.
     * @param options - Proxy event details
     */
    async logProxy(options: {
        guildId: string;
        actorUserId: string;
        memberId: number;
        channelId: string;
        originalMessageId: string;
        webhookMessageId: string;
    }): Promise<void> {
        try {
            const config = await this.guildConfigService.get(options.guildId);
            if (!config.logChannelId) return;

            const member = await db
                .select({ name: members.name })
                .from(members)
                .where(eq(members.id, options.memberId))
                .limit(1);

            if (!member[0]) return;

            const embed = new EmbedBuilder()
                .setTitle('Message Proxied')
                .addFields(
                    { name: 'Actor', value: `<@${options.actorUserId}>`, inline: true },
                    { name: 'Member', value: member[0].name, inline: true },
                    { name: 'Channel', value: `<#${options.channelId}>`, inline: true },
                    { name: 'Jump Link', value: `https://discord.com/channels/${options.guildId}/${options.channelId}/${options.webhookMessageId}`, inline: false }
                )
                .setTimestamp();

            const channel = await client.channels.fetch(config.logChannelId);
            if (channel && 'send' in channel) {
                await channel.send({
                    embeds: [embed],
                    allowedMentions: { parse: [] }
                });
            }
        } catch (error) {
            console.error('Failed to log proxy event:', error);
        }
    }

    /**
     * Logs a successful delete event.
     * @param options - Delete event details
     */
    async logDelete(options: {
        guildId: string;
        actorUserId: string;
        memberId: number;
        channelId: string;
        webhookMessageId: string;
    }): Promise<void> {
        try {
            const config = await this.guildConfigService.get(options.guildId);
            if (!config.logChannelId) return;

            const member = await db
                .select({ name: members.name })
                .from(members)
                .where(eq(members.id, options.memberId))
                .limit(1);

            if (!member[0]) return;

            const embed = new EmbedBuilder()
                .setTitle('Proxied Message Deleted')
                .addFields(
                    { name: 'Actor', value: `<@${options.actorUserId}>`, inline: true },
                    { name: 'Member', value: member[0].name, inline: true },
                    { name: 'Channel', value: `<#${options.channelId}>`, inline: true },
                    { name: 'Jump Link', value: `https://discord.com/channels/${options.guildId}/${options.channelId}/${options.webhookMessageId}`, inline: false }
                )
                .setTimestamp();

            const channel = await client.channels.fetch(config.logChannelId);
            if (channel && 'send' in channel) {
                await (channel as any).send({
                    embeds: [embed],
                    allowedMentions: { parse: [] }
                });
            }
        } catch (error) {
            console.error('Failed to log delete event:', error);
        }
    }
}

export const logService = new LogService();