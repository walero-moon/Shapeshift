import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction, MessageFlags, Message } from 'discord.js';
import { createForm } from '../app/CreateForm';
import { DEFAULT_ALLOWED_MENTIONS } from '../../../shared/utils/allowedMentions';
import { handleInteractionError, validateUrl } from '../../../shared/utils/errorHandling';

export const data = new SlashCommandSubcommandBuilder()
    .setName('add')
    .setDescription('Create a new form')
    .addStringOption(option =>
        option.setName('name')
            .setDescription('The name of the form')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('avatar_url')
            .setDescription('The avatar URL for the form')
            .setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<Message<boolean> | undefined> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const name = interaction.options.getString('name', true);
    const avatarUrl = interaction.options.getString('avatar_url');

    // Validate name
    if (!name.trim()) {
        return await interaction.editReply({
            content: 'Form name cannot be empty. Please provide a name for your form.',
            allowedMentions: DEFAULT_ALLOWED_MENTIONS
        });
    }

    // Validate avatar URL if provided
    if (avatarUrl) {
        const validation = validateUrl(avatarUrl, {
            component: 'identity',
            userId: interaction.user.id,
            guildId: interaction.guild?.id || undefined,
            channelId: interaction.channel?.id || undefined,
            interactionId: interaction.id
        });
        if (!validation.isValid) {
            return await interaction.editReply({
                content: validation.errorMessage || 'Invalid avatar URL.',
                allowedMentions: DEFAULT_ALLOWED_MENTIONS
            });
        }
    }

    try {
        const result = await createForm(interaction.user.id, {
            name: name.trim(),
            avatarUrl: avatarUrl?.trim() || null
        });

        let message = `✅ Form "${result.form.name}" created successfully!`;

        if (result.defaultAliases.length > 0) {
            message += '\n\n**Default aliases created:**';
            for (const alias of result.defaultAliases) {
                message += `\n• \`${alias.triggerRaw}\``;
            }
        }

        if (result.skippedAliases.length > 0) {
            message += '\n\n**Aliases skipped:**';
            for (const skipped of result.skippedAliases) {
                message += `\n• \`${skipped.triggerRaw}\` - ${skipped.reason}`;
            }
        }

        return await interaction.editReply({
            content: message,
            allowedMentions: DEFAULT_ALLOWED_MENTIONS
        });
    } catch (error) {
        await handleInteractionError(interaction, error, {
            component: 'identity',
            userId: interaction.user.id,
            guildId: interaction.guild?.id || undefined,
            channelId: interaction.channel?.id || undefined,
            interactionId: interaction.id
        });
        return undefined;
    }
}