import { eq } from 'drizzle-orm';
import { WebhookClient, GuildTextBasedChannel, PermissionsBitField } from 'discord.js';

import { db } from '../../db/client';
import { proxiedMessages } from '../../db/schema';
import { logService } from './LogService';

/**
 * Service for deleting proxied messages.
 */
export class DeleteService {
    /**
     * Deletes a proxied message.
     * @param options - Deletion options
     * @returns Result of the deletion attempt
     */
    async deleteProxied(options: {
        channel: GuildTextBasedChannel;
        messageId: string;
        webhookId?: string;
        webhookToken?: string;
        actorUserId: string;
    }): Promise<{ ok: boolean; reason?: string }> {
        const { channel, messageId, webhookId, webhookToken, actorUserId } = options;

        // Find proxied message
        const proxied = await db
            .select()
            .from(proxiedMessages)
            .where(eq(proxiedMessages.webhookMessageId, messageId))
            .limit(1);

        if (!proxied[0]) {
            return { ok: false, reason: 'Proxied message not found' };
        }

        const row = proxied[0];

        // Authorize actor
        if (row.actorUserId !== actorUserId) {
            const member = await channel.guild.members.fetch(actorUserId);
            if (!member.permissionsIn(channel).has(PermissionsBitField.Flags.ManageMessages)) {
                return { ok: false, reason: 'Unauthorized' };
            }
        }

        // Attempt deletion
        let deleteSuccess = false;
        try {
            if (webhookToken) {
                const whId = webhookId || row.webhookId;
                const webhookClient = new WebhookClient({ id: whId, token: webhookToken });
                await webhookClient.deleteMessage(row.webhookMessageId);
                deleteSuccess = true;
            } else {
                const message = await channel.messages.fetch(row.webhookMessageId);
                await message.delete();
                deleteSuccess = true;
            }
        } catch (error: any) {
            if (error.code === 404) {
                deleteSuccess = true; // Treat as success
            } else if (error.code === 403) {
                return { ok: false, reason: 'Insufficient permissions' };
            } else {
                return { ok: false, reason: `Deletion failed: ${error.message}` };
            }
        }

        // Clean up row if deletion succeeded
        if (deleteSuccess) {
            await db.delete(proxiedMessages).where(eq(proxiedMessages.id, row.id));

            // Log the delete event
            await logService.logDelete({
                guildId: channel.guild.id,
                actorUserId,
                memberId: row.memberId,
                channelId: channel.id,
                webhookMessageId: row.webhookMessageId,
            });
        }

        return { ok: true };
    }
}