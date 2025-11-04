import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';

import { FormService } from '../../../services/FormService';
import { ProxyService } from '../../../services/ProxyService';
import { permissionGuard } from '../../../middleware/permissionGuard';

export const execute = async (
    interaction: ChatInputCommandInteraction,
    formService: FormService,
    proxyService: ProxyService,
): Promise<void> => {
    const formName = interaction.options.getString('form');
    const text = interaction.options.getString('text');
    const file1 = interaction.options.getAttachment('file1');
    const file2 = interaction.options.getAttachment('file2');
    const file3 = interaction.options.getAttachment('file3');

    if (!formName || !text) {
        await interaction.reply({ content: 'Form and text are required.', flags: MessageFlags.Ephemeral });
        return;
    }

    const attachments = [file1, file2, file3].filter(Boolean);

    try {
        const channel = interaction.channel;
        if (!channel || !channel.isTextBased() || channel.isDMBased()) {
            await interaction.reply({ content: 'This command can only be used in guild text channels.', flags: MessageFlags.Ephemeral });
            return;
        }

        // Find form by name
        const forms = await formService.getForms(interaction.user.id);
        const form = forms.find(f => f.name === formName);

        if (!form) {
            await interaction.reply({ content: 'Form not found.', flags: MessageFlags.Ephemeral });
            return;
        }

        const guildMember = await interaction.guild!.members.fetch(interaction.user.id);
        const shaped = permissionGuard({
            member: guildMember,
            channel,
            source: { content: text, attachments },
        });

        if (!shaped) {
            await interaction.reply({ content: 'Insufficient permissions to send message.', flags: MessageFlags.Ephemeral });
            return;
        }

        const result = await proxyService.sendProxied({
            actorUserId: interaction.user.id,
            memberId: form.id,
            channel,
            content: text,
            attachments,
            originalMessageId: interaction.id,
        });

        // Reply with link to the proxied message
        const messageLink = `https://discord.com/channels/${interaction.guild!.id}/${result.channelId}/${result.messageId}`;
        await interaction.reply({ content: `Message sent: ${messageLink}`, flags: MessageFlags.Ephemeral });
    } catch (error: any) {
        if (error.message === 'Insufficient permissions to send message') {
            await interaction.reply({ content: 'Insufficient permissions to send message.', flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content: 'An error occurred while sending the message.', flags: MessageFlags.Ephemeral });
        }
    }
};