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
import { listForms } from '../../../identity/app/ListForms';
import { proxyMessageContext } from '../../app/ProxyMessageContext';
import { DEFAULT_ALLOWED_MENTIONS } from '../../../../shared/utils/allowedMentions';
import { handleInteractionError } from '../../../../shared/utils/errorHandling';
import { getChannelProxy } from '../../../../adapters/discord/DiscordChannelProxy';
import log from '../../../../shared/utils/logger';

export const proxyAsContextCommand = {
    data: new ContextMenuCommandBuilder()
        .setName('Proxy as')
        .setType(ApplicationCommandType.Message),
    async execute(interaction: MessageContextMenuCommandInteraction): Promise<void> {
        const targetMessage = interaction.targetMessage;

        if (!interaction.guild || !interaction.channel || !interaction.channel.isTextBased()) {
            await interaction.reply({
                content: '❌ This context menu can only be used inside guild text channels.',
                flags: MessageFlags.Ephemeral,
                allowedMentions: DEFAULT_ALLOWED_MENTIONS
            });
            return;
        }

        // Validate target message
        if (targetMessage.author.bot || targetMessage.author.system) {
            await interaction.reply({
                content: '❌ Cannot proxy bot or system messages.',
                flags: MessageFlags.Ephemeral,
                allowedMentions: DEFAULT_ALLOWED_MENTIONS
            });
            return;
        }

        // Get user's forms
        const forms = await listForms(interaction.user.id);
        if (forms.length === 0) {
            await interaction.reply({
                content: '❌ You have no forms to proxy as. Create a form first with `/form add`.',
                flags: MessageFlags.Ephemeral,
                allowedMentions: DEFAULT_ALLOWED_MENTIONS
            });
            return;
        }

        // Create modal
        const modal = new ModalBuilder()
            .setCustomId(`proxy_as:${targetMessage.id}`)
            .setTitle('Proxy Message as Form');

        // Form selector (text input with instructions)
        const formInput = new TextInputBuilder()
            .setCustomId('form_id')
            .setLabel(`Select form (available: ${forms.map(f => f.name).join(', ')})`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Type the exact form name')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(100);

        // Message preview (read-only)
        const messagePreview = new TextInputBuilder()
            .setCustomId('message_preview')
            .setLabel('Message Content (read-only)')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(targetMessage.content || '(no text content)')
            .setRequired(false)
            .setMinLength(0)
            .setMaxLength(2000); // Discord's max message length

        // Delete original checkbox (as text input for simplicity)
        const deleteOriginal = new TextInputBuilder()
            .setCustomId('delete_original')
            .setLabel('Delete original message? (yes/no)')
            .setStyle(TextInputStyle.Short)
            .setValue('no')
            .setRequired(false)
            .setMinLength(0)
            .setMaxLength(3);

        const formRow = new ActionRowBuilder<TextInputBuilder>().addComponents(formInput);
        const previewRow = new ActionRowBuilder<TextInputBuilder>().addComponents(messagePreview);
        const deleteRow = new ActionRowBuilder<TextInputBuilder>().addComponents(deleteOriginal);

        modal.addComponents(formRow, previewRow, deleteRow);

        await interaction.showModal(modal);
    }
};

export async function handleProxyAsModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    const [action, targetMessageId] = interaction.customId.split(':');
    if (action !== 'proxy_as' || !targetMessageId) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const formName = interaction.fields.getTextInputValue('form_id').trim();
        const deleteOriginalInput = interaction.fields.getTextInputValue('delete_original').toLowerCase().trim();
        const deleteOriginal = deleteOriginalInput === 'yes' || deleteOriginalInput === 'y';

        if (!interaction.guild || !interaction.channel || !interaction.channel.isTextBased()) {
            throw new Error('This context menu can only be used inside guild text channels.');
        }

        // Fetch the target message
        const targetMessage = await interaction.channel.messages.fetch(targetMessageId);
        if (!targetMessage) {
            throw new Error('Target message not found. It may have been deleted.');
        }

        // Validate again (in case it changed)
        if (targetMessage.author.bot || targetMessage.author.system) {
            throw new Error('Cannot proxy bot or system messages.');
        }

        // Find form by name
        const forms = await listForms(interaction.user.id);
        const selectedForm = forms.find(f => f.name.toLowerCase() === formName.toLowerCase());
        if (!selectedForm) {
            throw new Error(`Form "${formName}" not found. Available forms: ${forms.map(f => f.name).join(', ')}`);
        }

        const formForProxy = {
            id: selectedForm.id,
            userId: interaction.user.id,
            name: selectedForm.name,
            avatarUrl: selectedForm.avatarUrl ?? null,
            createdAt: selectedForm.createdAt
        };

        // Get channel proxy
        const channelProxy = getChannelProxy(interaction.channel.id);

        // Execute proxy
        await proxyMessageContext({
            userId: interaction.user.id,
            formId: selectedForm.id,
            targetMessage: {
                content: targetMessage.content ?? '',
                attachments: Array.from(targetMessage.attachments.values()).map(att => ({
                    name: att.name,
                    url: att.url,
                    id: att.id,
                    size: att.size
                })),
                author: {
                    bot: targetMessage.author.bot,
                    system: targetMessage.author.system
                }
            },
            channelContext: {
                guildId: interaction.guild.id,
                channelId: interaction.channel.id
            },
            deleteOriginal,
            sourceMessageId: targetMessage.id,
            form: formForProxy
        }, channelProxy);

        // Delete original if requested
        if (deleteOriginal) {
            try {
                await targetMessage.delete();
                log.info('Original message deleted after proxy', {
                    component: 'proxy-context',
                    userId: interaction.user.id,
                    guildId: interaction.guild!.id,
                    channelId: interaction.channel!.id,
                    targetMessageId,
                    status: 'original_deleted'
                });
            } catch (deleteError) {
                log.warn('Failed to delete original message', {
                    component: 'proxy-context',
                    userId: interaction.user.id,
                    guildId: interaction.guild!.id,
                    channelId: interaction.channel!.id,
                    targetMessageId,
                    error: deleteError instanceof Error ? deleteError.message : String(deleteError),
                    status: 'delete_failed'
                });
            }
        }

        await interaction.editReply({
            content: `✅ Message proxied successfully!${deleteOriginal ? ' Original message deleted.' : ''}`,
            allowedMentions: DEFAULT_ALLOWED_MENTIONS
        });
    } catch (error) {
        await handleInteractionError(interaction, error, {
            component: 'proxy-context',
            userId: interaction.user.id,
            guildId: interaction.guild?.id,
            channelId: interaction.channel?.id,
            interactionId: interaction.id
        }, error instanceof Error ? error.message : 'An error occurred while proxying the message.');
    }
}
