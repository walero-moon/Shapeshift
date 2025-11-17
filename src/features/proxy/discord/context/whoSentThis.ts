import {
    ContextMenuCommandBuilder,
    MessageContextMenuCommandInteraction,
    MessageFlags,
    ApplicationCommandType,
    EmbedBuilder
} from 'discord.js';
import { DEFAULT_ALLOWED_MENTIONS } from '../../../../shared/utils/allowedMentions';
import { handleInteractionError } from '../../../../shared/utils/errorHandling';
import { getProxiedMessageDetails } from '../../app/GetProxiedMessageDetails';
import { buildMessageUrl } from '../../../../shared/utils/messageLink';
import log from '../../../../shared/utils/logger';

export const whoSentThisContextCommand = {
    data: new ContextMenuCommandBuilder()
        .setName('Who sent this')
        .setType(ApplicationCommandType.Message),
    async execute(interaction: MessageContextMenuCommandInteraction): Promise<void> {
        const baseContext = {
            component: 'proxy-context',
            action: 'who_sent_context',
            userId: interaction.user.id,
            guildId: interaction.guild?.id,
            channelId: interaction.channel?.id,
            interactionId: interaction.id,
            targetMessageId: interaction.targetMessage.id
        };
        const start = Date.now();
        log.info('Who-sent context invoked', {
            ...baseContext,
            status: 'context_start'
        });

        try {
            if (!interaction.guild || !interaction.channel || !interaction.channel.isTextBased()) {
                log.warn('Who-sent context outside guild channel', {
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

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                const details = await getProxiedMessageDetails(interaction.targetMessage.id);

                const jumpUrl = buildMessageUrl({
                    guildId: details.guildId,
                    channelId: details.channelId,
                    messageId: details.messageId
                });

                const sourceJump = details.sourceMessageId
                    ? buildMessageUrl({
                        guildId: details.guildId,
                        channelId: details.channelId,
                        messageId: details.sourceMessageId
                    })
                    : null;

                const embed = new EmbedBuilder()
                    .setTitle('Proxied Message Details')
                    .addFields(
                        { name: 'Original User', value: `<@${details.userId}>`, inline: true },
                        { name: 'Form', value: `${details.formName} (${details.formId})`, inline: true },
                        { name: 'Proxied At', value: `<t:${Math.floor(details.createdAt.getTime() / 1000)}:f>` }
                    )
                    .setFooter({ text: `Message ID: ${details.messageId}` })
                    .setURL(jumpUrl)
                    .setColor(0x5865F2)
                    .setTimestamp(details.createdAt);

                if (details.formAvatarUrl) {
                    embed.setThumbnail(details.formAvatarUrl);
                }

                if (sourceJump) {
                    embed.addFields({
                        name: 'Source Message',
                        value: `[Jump to original](${sourceJump})`
                    });
                } else {
                    embed.addFields({
                        name: 'Source Message',
                        value: 'Not recorded'
                    });
                }

                await interaction.editReply({
                    embeds: [embed],
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
                log.info('Who-sent context completed', {
                    ...baseContext,
                    status: 'context_success',
                    durationMs: Date.now() - start
                });
            } catch (innerError) {
                await interaction.editReply({
                    content: innerError instanceof Error ? innerError.message : 'Could not find proxied message details.',
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
                log.warn('Who-sent lookup failed', {
                    ...baseContext,
                    error: innerError instanceof Error ? innerError.message : String(innerError),
                    status: 'context_lookup_failed'
                });
            }
        } catch (error) {
            await handleInteractionError(
                interaction,
                error,
                {
                    component: 'proxy-context',
                    userId: interaction.user.id,
                    guildId: interaction.guild?.id,
                    channelId: interaction.channel?.id,
                    interactionId: interaction.id
                },
                error instanceof Error ? error.message : 'Failed to resolve proxied message metadata.'
            );
            log.error('Who-sent context errored', {
                ...baseContext,
                error: error instanceof Error ? error.message : String(error),
                status: 'context_error'
            });
        }
    }
};
