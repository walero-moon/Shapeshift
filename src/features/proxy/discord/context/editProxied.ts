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
import log from '../../../../shared/utils/logger';

const EDIT_MODAL_PREFIX = 'edit_proxied';

export const editProxiedContextCommand = {
    data: new ContextMenuCommandBuilder()
        .setName('Edit proxied message')
        .setType(ApplicationCommandType.Message),
    async execute(interaction: MessageContextMenuCommandInteraction): Promise<void> {
        const baseContext = {
            component: 'proxy-context',
            action: 'edit_proxied_context',
            userId: interaction.user.id,
            guildId: interaction.guild?.id,
            channelId: interaction.channel?.id,
            interactionId: interaction.id,
            targetMessageId: interaction.targetMessage.id
        };
        const start = Date.now();
        log.info('Edit proxied context triggered', {
            ...baseContext,
            status: 'context_start'
        });

        try {
            if (!interaction.guild || !interaction.channel || !interaction.channel.isTextBased()) {
                log.warn('Edit proxied context outside guild channel', {
                    ...baseContext,
                    status: 'context_invalid_channel'
                });
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
                log.warn('Edit proxied context message not tracked', {
                    ...baseContext,
                    status: 'context_not_tracked'
                });
                await interaction.reply({
                    content: '❌ This message was not proxied by Shapeshift or the log has expired.',
                    flags: MessageFlags.Ephemeral,
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
                return;
            }

            if (record.userId !== interaction.user.id) {
                log.warn('Edit proxied context unauthorized user', {
                    ...baseContext,
                    ownerId: record.userId,
                    status: 'context_not_owner'
                });
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
            log.info('Edit proxied modal displayed', {
                ...baseContext,
                status: 'context_modal_shown',
                durationMs: Date.now() - start
            });
        } catch (error) {
            await handleInteractionError(interaction, error, {
                component: 'proxy-context',
                userId: interaction.user.id,
                guildId: interaction.guild?.id,
                channelId: interaction.channel?.id,
                interactionId: interaction.id
            }, 'An unexpected error occurred while preparing the edit modal.');
            log.error('Edit proxied context failed', {
                ...baseContext,
                error: error instanceof Error ? error.message : String(error),
                status: 'context_error'
            });
        }
    }
};

export async function handleEditProxiedModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    const [prefix, targetMessageId] = interaction.customId.split(':');
    if (prefix !== EDIT_MODAL_PREFIX || !targetMessageId) return;

    const baseContext = {
        component: 'proxy-context',
        action: 'edit_proxied_modal',
        userId: interaction.user.id,
        guildId: interaction.guild?.id,
        channelId: interaction.channel?.id,
        interactionId: interaction.id,
        targetMessageId
    };
    const start = Date.now();
    log.info('Edit proxied modal submission received', {
        ...baseContext,
        status: 'modal_start'
    });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.deleteReply().catch(() => {});

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
        log.info('Edit proxied modal completed', {
            ...baseContext,
            status: 'modal_success',
            durationMs: Date.now() - start
        });

    } catch (error) {
        await handleInteractionError(interaction, error, {
            component: 'proxy-context',
            userId: interaction.user.id,
            guildId: interaction.guild?.id,
            channelId: interaction.channel?.id,
            interactionId: interaction.id
        }, error instanceof Error ? error.message : 'Failed to edit the proxied message.', { preferFollowUp: true });
        log.error('Edit proxied modal failed', {
            ...baseContext,
            error: error instanceof Error ? error.message : String(error),
            status: 'modal_error'
        });
    }
}
