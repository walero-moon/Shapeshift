import { Client, Events, MessageReaction, User, PermissionsBitField, PartialMessageReaction, PartialUser } from 'discord.js';
import { eq } from 'drizzle-orm';

import { db } from '../../db/client';
import { proxiedMessages } from '../../db/schema';
import { DeleteService } from '../services/DeleteService';

/**
 * Registers the messageReactionAdd listener to handle 🗑️ reactions on proxied messages.
 */
export const registerMessageReactionAddListener = (client: Client) => {
    const deleteService = new DeleteService();
    const pendingDeletions = new Set<string>();

    client.on(Events.MessageReactionAdd, async (reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) => {
        try {
            // Ignore bot reactions
            if (user.bot) return;

            // Only handle 🗑️ emoji
            if (reaction.emoji.name !== '🗑️') return;

            // Fetch partials if needed
            if (reaction.partial) await reaction.fetch();
            if (reaction.message.partial) await reaction.message.fetch();

            // Ensure guild context
            if (!reaction.message.guild) return;

            // Ensure user is full
            if (user.partial) await user.fetch();

            // Dedupe by message ID + user ID
            const key = `${reaction.message.id}-${user.id}`;
            if (pendingDeletions.has(key)) return;
            pendingDeletions.add(key);

            // Lookup proxied message
            const proxied = await db
                .select()
                .from(proxiedMessages)
                .where(eq(proxiedMessages.webhookMessageId, reaction.message.id))
                .limit(1);

            if (!proxied[0]) {
                pendingDeletions.delete(key);
                return;
            }

            const row = proxied[0];

            // Authorize reactor
            if (row.actorUserId !== user.id) {
              const member = await reaction.message.guild.members.fetch(user.id);
              if (!member.permissionsIn(reaction.message.channel as any).has(PermissionsBitField.Flags.ManageMessages)) {
                pendingDeletions.delete(key);
                return;
              }
            }

            // Delete via service
            await deleteService.deleteProxied({
                channel: reaction.message.channel as any,
                messageId: reaction.message.id,
                actorUserId: user.id,
            });

            pendingDeletions.delete(key);
        } catch {
            // Silent on errors
            const key = `${reaction.message.id}-${user.id}`;
            pendingDeletions.delete(key);
        }
    });
};
