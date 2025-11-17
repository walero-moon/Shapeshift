import {
    ContextMenuCommandBuilder,
    MessageContextMenuCommandInteraction,
    MessageFlags,
    ApplicationCommandType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ModalSubmitInteraction
} from 'discord.js';
import { proxiedMessageRepo } from '../../infra/ProxiedMessageRepo';
import { DEFAULT_ALLOWED_MENTIONS } from '../../../../shared/utils/allowedMentions';
import { handleInteractionError } from '../../../../shared/utils/errorHandling';
import { editProxiedMessage } from '../../app/EditProxiedMessage';
import { getChannelProxy } from '../../../../adapters/discord/DiscordChannelProxy';

const EDIT_MODAL_PREFIX = 'edit_proxied';

export const editProxiedContextCommand = {
    data: new ContextMenuCommandBuilder()
        .setName('Edit proxied message')
        .setType(ApplicationCommandType.Message),
    async execute(interaction: MessageContextMenuCommandInteraction): Promise<void> {
        try {
            if (!interaction.guild || !interaction.channel || !interaction.channel.isTextBased()) {
                await interaction.reply({
                    content: '❌ This context menu can only be used inside guild text channels.',
                    flags: MessageFlags.Ephemeral,
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
                return;
            }

            const targetMessage = interaction.targetMessage;
            const record = await proxiedMessageRepo.getByWebhookMessageId(targetMessage.id);

            if (!record) {
                await interaction.reply({
                    content: '❌ This message was not proxied by Shapeshift or the log has expired.',
                    flags: MessageFlags.Ephemeral,
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
                return;
            }

            if (record.userId !== interaction.user.id) {
                await interaction.reply({
                    content: '❌ You can only edit messages that you proxied.',
                    flags: MessageFlags.Ephemeral,
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
                return;
            }

            const modal = new ModalBuilder()
                .setCustomId(`${EDIT_MODAL_PREFIX}:${targetMessage.id}`)
                .setTitle('Edit proxied message');

            const contentInput = new TextInputBuilder()
                .setCustomId('edited_content')
                .setLabel('Updated message content')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMinLength(0)
                .setMaxLength(2000)
                .setValue((targetMessage.content || '').slice(0, 2000));

            const row = new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput);
            modal.addComponents(row);

            await interaction.showModal(modal);
        } catch (error) {
            await handleInteractionError(interaction, error, {
                component: 'proxy-context',
                userId: interaction.user.id,
                guildId: interaction.guild?.id,
                channelId: interaction.channel?.id,
                interactionId: interaction.id
            }, 'An unexpected error occurred while preparing the edit modal.');
        }
    }
};

export async function handleEditProxiedModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    const [prefix, targetMessageId] = interaction.customId.split(':');
    if (prefix !== EDIT_MODAL_PREFIX || !targetMessageId) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        if (!interaction.guild || !interaction.channel || !interaction.channel.isTextBased()) {
            throw new Error('This context menu can only be used inside guild text channels.');
        }

        const record = await proxiedMessageRepo.getByWebhookMessageId(targetMessageId);
        if (!record) {
            throw new Error('This message was not proxied by Shapeshift or the record has expired.');
        }

        if (record.userId !== interaction.user.id) {
            throw new Error('You can only edit messages that you proxied.');
        }

        const newContent = interaction.fields.getTextInputValue('edited_content') ?? '';
        if (newContent.length > 2000) {
            throw new Error('Edited content exceeds Discord’s 2000 character limit.');
        }

        const targetMessage = await interaction.channel.messages.fetch(targetMessageId);
        if (!targetMessage) {
            throw new Error('Target message not found. It may have been deleted.');
        }

        const attachments = targetMessage.attachments.size > 0
            ? Array.from(targetMessage.attachments.values()).map(att => ({
                id: att.id,
                url: att.url,
                name: att.name ?? undefined,
                size: att.size
            }))
            : undefined;

        const channelProxy = getChannelProxy(record.channelId);

        await editProxiedMessage(
            {
                record,
                userId: interaction.user.id,
                content: newContent,
                attachments
            },
            channelProxy
        );

        await interaction.editReply({
            content: '✅ Proxied message updated successfully.',
            allowedMentions: DEFAULT_ALLOWED_MENTIONS
        });
    } catch (error) {
        await handleInteractionError(interaction, error, {
            component: 'proxy-context',
            userId: interaction.user.id,
            guildId: interaction.guild?.id,
            channelId: interaction.channel?.id,
            interactionId: interaction.id
        }, error instanceof Error ? error.message : 'Failed to edit the proxied message.');
    }
}
