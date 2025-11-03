import { ApplicationCommandType, ContextMenuCommandBuilder } from 'discord.js';

import { DeleteService } from '../services/DeleteService';
import { WebhookRegistry } from '../services/WebhookRegistry';
import type { MessageContextCommand } from './_loader';

const deleteService = new DeleteService();
const webhookRegistry = new WebhookRegistry();

/**
 * Context menu command to delete a proxied message.
 */
export const context: MessageContextCommand = {
    data: new ContextMenuCommandBuilder()
        .setName('Delete proxied message')
        .setType(ApplicationCommandType.Message)
        .setDMPermission(false),
    execute: async (interaction) => {
        const targetMessageId = interaction.targetMessage.id;
        const channel = interaction.channel as any; // GuildTextBasedChannel
        const actorUserId = interaction.user.id;

        try {
            // Get webhook token if available
            let webhookToken: string | undefined;
            try {
                const webhook = await webhookRegistry.getOrCreate(channel);
                webhookToken = webhook.token;
            } catch {
                // Ignore, fallback to bot deletion
            }

            const result = await deleteService.deleteProxied({
                channel,
                messageId: targetMessageId,
                webhookToken,
                actorUserId,
            });

            if (result.ok) {
                await interaction.reply({
                    content: 'Proxied message deleted successfully.',
                    ephemeral: true,
                });
            } else {
                await interaction.reply({
                    content: `Failed to delete proxied message: ${result.reason}`,
                    ephemeral: true,
                });
            }
        } catch (error: any) {
            await interaction.reply({
                content: `An error occurred: ${error.message}`,
                ephemeral: true,
            });
        }
    },
};