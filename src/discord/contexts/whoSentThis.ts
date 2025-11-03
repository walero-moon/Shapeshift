import { ApplicationCommandType, ContextMenuCommandBuilder, PermissionFlagsBits, MessageContextMenuCommandInteraction } from 'discord.js';
import { eq } from 'drizzle-orm';

import { db } from '../../db/client';
import { proxiedMessages, members } from '../../db/schema';
import type { MessageContextCommand } from './_loader';

/**
 * Context menu command to show who sent a proxied message.
 */
export const context: MessageContextCommand = {
    data: new ContextMenuCommandBuilder()
        .setName('Who sent this (proxy)?')
        .setType(ApplicationCommandType.Message)
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    execute: async (interaction: MessageContextMenuCommandInteraction) => {
        await interaction.deferReply({ ephemeral: true });

        const targetMessageId = interaction.targetMessage.id;
        const actorUserId = interaction.user.id;
        const channel = interaction.channel as any; // GuildTextBasedChannel

        // Check permissions
        try {
            const member = await channel.guild.members.fetch(actorUserId);
            if (!member.permissionsIn(channel).has(PermissionFlagsBits.ManageMessages)) {
                return interaction.editReply({
                    content: 'You do not have permission to use this command.',
                });
            }
        } catch (error) {
            return interaction.editReply({
                content: 'Failed to verify permissions.',
            });
        }

        try {
            // Query proxied message info
            const result = await db
                .select({
                    actorUserId: proxiedMessages.actorUserId,
                    memberName: members.name,
                    createdAt: proxiedMessages.createdAt,
                    channelId: proxiedMessages.channelId,
                })
                .from(proxiedMessages)
                .innerJoin(members, eq(proxiedMessages.memberId, members.id))
                .where(eq(proxiedMessages.webhookMessageId, targetMessageId))
                .limit(1);

            if (!result[0]) {
                return interaction.editReply({
                    content: 'No proxy information found for this message.',
                });
            }

            const { actorUserId: originalActor, memberName, createdAt, channelId } = result[0];

            // Fetch user for mention
            const user = await interaction.client.users.fetch(originalActor);
            const mention = `<@${originalActor}> (${originalActor})`;

            // Format timestamp
            const timestamp = createdAt ? new Date(Number(createdAt) * 1000).toLocaleString() : 'Unknown';

            // Fetch channel name
            let channelName = `Unknown channel (${channelId})`;
            try {
                const channelObj = await interaction.client.channels.fetch(channelId);
                if (channelObj) {
                    channelName = `#${(channelObj as any).name}`;
                }
            } catch {
                // Keep default
            }

            const content = `**Original Actor:** ${mention}\n**Member Used:** ${memberName}\n**Timestamp:** ${timestamp}\n**Channel:** ${channelName}`;

            await interaction.editReply({
                content,
            });
        } catch (error: any) {
            await interaction.editReply({
                content: `An error occurred: ${error.message}`,
            });
        }
    },
};