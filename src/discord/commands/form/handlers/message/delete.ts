import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';

import { FormService } from '../../../../services/FormService';
import { ProxyService } from '../../../../services/ProxyService';
import { DeleteService } from '../../../../services/DeleteService';
import { WebhookRegistry } from '../../../../services/WebhookRegistry';

const deleteService = new DeleteService();
const webhookRegistry = new WebhookRegistry();

export const execute = async (
    interaction: ChatInputCommandInteraction,
    formService: FormService,
    proxyService: ProxyService,
): Promise<void> => {
    const message_link_or_id = interaction.options.getString('message_id');

    if (!message_link_or_id) {
        await interaction.reply({ content: 'Message ID is required.', flags: MessageFlags.Ephemeral });
        return;
    }

    try {
        const channel = interaction.channel;
        if (!channel || !channel.isTextBased() || channel.isDMBased()) {
            await interaction.reply({ content: 'This command can only be used in guild text channels.', flags: MessageFlags.Ephemeral });
            return;
        }

        // Parse message ID from link or direct ID
        let messageId: string;
        if (message_link_or_id.includes('/')) {
            const parts = message_link_or_id.split('/');
            messageId = parts[parts.length - 1];
        } else {
            messageId = message_link_or_id;
        }

        const actorUserId = interaction.user.id;

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
            messageId,
            webhookToken,
            actorUserId,
        });

        if (result.ok) {
            await interaction.reply({
                content: 'Proxied message deleted successfully.',
                flags: MessageFlags.Ephemeral,
            });
        } else {
            await interaction.reply({
                content: `Failed to delete proxied message: ${result.reason}`,
                flags: MessageFlags.Ephemeral,
            });
        }
    } catch (error: any) {
        await interaction.reply({
            content: `An error occurred: ${error.message}`,
            flags: MessageFlags.Ephemeral,
        });
    }
};