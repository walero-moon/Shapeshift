import { eq } from 'drizzle-orm';

import { db } from '../../db/client';
import { guildConfigs } from '../../db/schema';

/**
 * Service for managing guild configurations.
 */
export class GuildConfigService {
    /**
     * Gets the configuration for a guild, with defaults if not set.
     * @param guildId - The guild ID
     * @returns The guild configuration
     */
    async get(guildId: string): Promise<{
        guildId: string;
        logChannelId: string | null;
        deleteOriginalOnProxy: boolean;
        tagProxyEnabled: boolean;
    }> {
        const result = await db
            .select()
            .from(guildConfigs)
            .where(eq(guildConfigs.guildId, guildId))
            .limit(1);

        if (result[0]) {
            return {
                guildId: result[0].guildId,
                logChannelId: result[0].logChannelId,
                deleteOriginalOnProxy: result[0].deleteOriginalOnProxy === 1,
                tagProxyEnabled: result[0].tagProxyEnabled === 1,
            };
        } else {
            return {
                guildId,
                logChannelId: null,
                deleteOriginalOnProxy: false,
                tagProxyEnabled: false,
            };
        }
    }

    /**
     * Sets the log channel for a guild.
     * @param guildId - The guild ID
     * @param channelId - The channel ID, or null to unset
     */
    async setLogChannel(guildId: string, channelId: string | null): Promise<void> {
        await db
            .insert(guildConfigs)
            .values({ guildId, logChannelId: channelId })
            .onConflictDoUpdate({
                target: guildConfigs.guildId,
                set: { logChannelId: channelId },
            });
    }

    /**
     * Sets whether to delete original messages on proxy for a guild.
     * @param guildId - The guild ID
     * @param on - Whether to enable deletion
     */
    async setDeleteOriginal(guildId: string, on: boolean): Promise<void> {
        await db
            .insert(guildConfigs)
            .values({ guildId, deleteOriginalOnProxy: on ? 1 : 0 })
            .onConflictDoUpdate({
                target: guildConfigs.guildId,
                set: { deleteOriginalOnProxy: on ? 1 : 0 },
            });
    }

    /**
     * Sets whether tag proxy is enabled for a guild.
     * @param guildId - The guild ID
     * @param on - Whether to enable tag proxy
     */
    async setTagProxyEnabled(guildId: string, on: boolean): Promise<void> {
        await db
            .insert(guildConfigs)
            .values({ guildId, tagProxyEnabled: on ? 1 : 0 })
            .onConflictDoUpdate({
                target: guildConfigs.guildId,
                set: { tagProxyEnabled: on ? 1 : 0 },
            });
    }
}