import {
    ContextMenuCommandBuilder,
    MessageContextMenuCommandInteraction,
    MessageFlags,
    ApplicationCommandType
} from 'discord.js';
import { proxiedMessageRepo } from '../../infra/ProxiedMessageRepo';
import { getChannelProxy } from '../../../../adapters/discord/DiscordChannelProxy';
import { deleteProxiedMessage } from '../../app/DeleteProxiedMessage';
import { DEFAULT_ALLOWED_MENTIONS } from '../../../../shared/utils/allowedMentions';
import { handleInteractionError } from '../../../../shared/utils/errorHandling';
import log from '../../../../shared/utils/logger';

export const deleteProxiedContextCommand = {
    data: new ContextMenuCommandBuilder()
        .setName('Delete proxied message')
        .setType(ApplicationCommandType.Message),
    async execute(interaction: MessageContextMenuCommandInteraction): Promise<void> {
        const baseContext = {
            component: 'proxy-context',
            action: 'delete_proxied_context',
            userId: interaction.user.id,
            guildId: interaction.guild?.id,
            channelId: interaction.channel?.id,
            interactionId: interaction.id,
            targetMessageId: interaction.targetMessage.id
        };
        const start = Date.now();
        log.info('Delete proxied context triggered', {
            ...baseContext,
            status: 'context_start'
        });

        try {
            if (!interaction.guild || !interaction.channel || !interaction.channel.isTextBased()) {
                log.warn('Delete proxied context outside guild channel', {
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

            const record = await proxiedMessageRepo.getByWebhookMessageId(interaction.targetMessage.id);

            if (!record) {
                log.warn('Delete proxied context message not tracked', {
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
                log.warn('Delete proxied context unauthorized user', {
                    ...baseContext,
                    ownerId: record.userId,
                    status: 'context_not_owner'
                });
                await interaction.reply({
                    content: '❌ You can only delete messages that you proxied.',
                    flags: MessageFlags.Ephemeral,
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
                return;
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await interaction.deleteReply().catch(() => {});

            const channelProxy = getChannelProxy(record.channelId);

            await deleteProxiedMessage(
                {
                    record,
                    userId: interaction.user.id
                },
                channelProxy
            );
            log.info('Delete proxied context completed', {
                ...baseContext,
                status: 'context_success',
                durationMs: Date.now() - start
            });
        } catch (error) {
            await handleInteractionError(interaction, error, {
                component: 'proxy-context',
                userId: interaction.user.id,
                guildId: interaction.guild?.id,
                channelId: interaction.channel?.id,
                interactionId: interaction.id
            }, error instanceof Error ? error.message : 'Failed to delete the proxied message.', { preferFollowUp: true });
            log.error('Delete proxied context failed', {
                ...baseContext,
                error: error instanceof Error ? error.message : String(error),
                status: 'context_error'
            });
        }
    }
};
