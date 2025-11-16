import { SlashCommandBuilder, ChatInputCommandInteraction, Message, MessageFlags, ChannelType, TextChannel } from 'discord.js';
import { formRepo } from '../../identity/infra/FormRepo';
import { proxyCoordinator } from '../app/ProxyCoordinator';
import { validateUserChannelPerms } from '../app/ValidateUserChannelPerms';
import { DiscordChannelProxy } from '../../../adapters/discord/DiscordChannelProxy';
import { handleInteractionError } from '../../../shared/utils/errorHandling';
import { DEFAULT_ALLOWED_MENTIONS } from '../../../shared/utils/allowedMentions';
import { reuploadAttachments } from '../../../shared/utils/attachments';

export const command = {
    data: new SlashCommandBuilder()
        .setName('send')
        .setDescription('Send a message as one of your forms')
        .addStringOption(option =>
            option
                .setName('form')
                .setDescription('The form to send as')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addStringOption(option =>
            option
                .setName('text')
                .setDescription('The message text to send')
                .setRequired(true)
        )
        .addAttachmentOption(option =>
            option
                .setName('attachment1')
                .setDescription('Optional attachment')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName('attachment2')
                .setDescription('Optional attachment')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName('attachment3')
                .setDescription('Optional attachment')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName('attachment4')
                .setDescription('Optional attachment')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName('attachment5')
                .setDescription('Optional attachment')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName('attachment6')
                .setDescription('Optional attachment')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName('attachment7')
                .setDescription('Optional attachment')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName('attachment8')
                .setDescription('Optional attachment')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName('attachment9')
                .setDescription('Optional attachment')
                .setRequired(false)
        )
        .addAttachmentOption(option =>
            option
                .setName('attachment10')
                .setDescription('Optional attachment')
                .setRequired(false)
        ),
    execute: async (interaction: ChatInputCommandInteraction): Promise<Message<boolean> | undefined> => {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const formId = interaction.options.getString('form', true);
            const text = interaction.options.getString('text', true);

            // Get the form from database
            const form = await formRepo.getById(formId);
            if (!form) {
                return interaction.editReply({
                    content: 'Form not found. Please select a valid form.',
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
            }

            // Check if the form belongs to the user
            if (form.userId !== interaction.user.id) {
                return interaction.editReply({
                    content: 'You can only send as your own forms.',
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
            }

            // Validate permissions (only for guild channels)
            if (!interaction.guild || !interaction.channel || !interaction.channel.isTextBased() || interaction.channel.type === ChannelType.DM) {
                return interaction.editReply({
                    content: 'This command can only be used in server channels.',
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
            }

            const hasPerms = await validateUserChannelPerms(
                interaction.user.id,
                interaction.channel as TextChannel,
                [] // attachments will be collected below
            );
            if (!hasPerms) {
                return interaction.editReply({
                    content: 'You do not have permission to send messages in this channel.',
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
            }

            // Collect attachments in Discord.js format
            const discordAttachments = [];
            for (let i = 1; i <= 10; i++) {
                const attachment = interaction.options.getAttachment(`attachment${i}`);
                if (attachment) {
                    discordAttachments.push(attachment);
                }
            }

            // Re-validate permissions with Discord attachments
            const hasPermsWithAttachments = await validateUserChannelPerms(
                interaction.user.id,
                interaction.channel as TextChannel,
                discordAttachments
            );
            if (!hasPermsWithAttachments) {
                return interaction.editReply({
                    content: 'You do not have permission to attach files in this channel.',
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
            }

            // Reupload Discord attachments to standardized format
            const standardizedAttachments = await reuploadAttachments(
                discordAttachments.map(attachment => ({
                    name: attachment.name,
                    url: attachment.url,
                    id: attachment.id
                }))
            );

            // Create channel proxy
            const channelProxy = new DiscordChannelProxy(interaction.channel!.id);

            // Proxy the message with standardized attachments
            const result = await proxyCoordinator(
                interaction.user.id,
                formId,
                interaction.channel!.id,
                interaction.guild!.id,
                text,
                channelProxy,
                standardizedAttachments
            );

            // Confirm with link to the message
            const messageLink = `https://discord.com/channels/${interaction.guild!.id}/${interaction.channel!.id}/${result.messageId}`;
            await interaction.editReply({
                content: `Message sent successfully! [View Message](${messageLink})`,
                allowedMentions: DEFAULT_ALLOWED_MENTIONS
            });
            return;
        } catch (error) {
            await handleInteractionError(interaction, error, {
                component: 'proxy',
                userId: interaction.user.id,
                guildId: interaction.guild?.id || undefined,
                channelId: interaction.channel?.id || undefined,
                interactionId: interaction.id
            });
            return;
        }
    }
};