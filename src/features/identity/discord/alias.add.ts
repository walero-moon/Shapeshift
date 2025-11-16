import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction, MessageFlags, Message } from 'discord.js';
import { addAlias } from '../app/AddAlias';
import { DEFAULT_ALLOWED_MENTIONS } from '../../../shared/utils/allowedMentions';
import { handleInteractionError } from '../../../shared/utils/errorHandling';
import { invalidateAliasCache } from '../../proxy/app/MatchAlias';

export const data = new SlashCommandSubcommandBuilder()
    .setName('add')
    .setDescription('Add an alias to a form')
    .addStringOption(option =>
        option.setName('form')
            .setDescription('The form to add the alias to')
            .setRequired(true)
            .setAutocomplete(true))
    .addStringOption(option =>
        option.setName('trigger')
            .setDescription('The trigger text (must contain "text")')
            .setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<Message<boolean> | undefined> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const formId = interaction.options.getString('form', true);
    const trigger = interaction.options.getString('trigger', true);

    try {
        const result = await addAlias(formId, interaction.user.id, { trigger });

        // Invalidate cache after successful alias addition
        invalidateAliasCache(interaction.user.id);

        return await interaction.editReply({
            content: `✅ Alias "${result.triggerRaw}" added successfully!`,
            allowedMentions: DEFAULT_ALLOWED_MENTIONS
        });
    } catch (error) {
        // Handle validation errors with user-friendly messages
        if (error instanceof Error) {
            const errorMessage = error.message;

            if (errorMessage === 'Alias trigger is required') {
                return await interaction.editReply({
                    content: '❌ Alias trigger cannot be empty. Please provide a trigger text.',
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
            }

            if (errorMessage === 'Alias trigger must contain the literal word "text"') {
                return await interaction.editReply({
                    content: '❌ Alias trigger must contain the literal word "text". For example: `neoli:text` or `{text}`.',
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
            }

            if (errorMessage === 'Form not found') {
                return await interaction.editReply({
                    content: '❌ The selected form was not found. It may have been deleted.',
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
            }

            if (errorMessage === 'Form does not belong to user') {
                return await interaction.editReply({
                    content: '❌ You do not own this form.',
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
            }

            if (errorMessage.startsWith('Alias "') && errorMessage.includes('" already exists for this user')) {
                return await interaction.editReply({
                    content: `❌ ${errorMessage}`,
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
            }
        }

        // For unexpected errors, use the generic handler
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