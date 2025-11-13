import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction, MessageFlags, Message } from 'discord.js';
import { deleteForm } from '../app/DeleteForm';
import { DEFAULT_ALLOWED_MENTIONS } from '../../../shared/utils/allowedMentions';
import { handleInteractionError } from '../../../shared/utils/errorHandling';

export const data = new SlashCommandSubcommandBuilder()
    .setName('delete')
    .setDescription('Delete a form and all its aliases')
    .addStringOption(option =>
        option.setName('form')
            .setDescription('The form to delete')
            .setRequired(true)
            .setAutocomplete(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<Message<boolean> | undefined> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const formId = interaction.options.getString('form', true);

    try {
        await deleteForm(formId, interaction.user.id);

        return await interaction.editReply({
            content: '✅ Form deleted successfully.',
            allowedMentions: DEFAULT_ALLOWED_MENTIONS
        });
    } catch (error) {
        // Handle ownership violations directly with specific error message
        if (error instanceof Error && error.message === 'Form does not belong to user') {
            await interaction.editReply({
                content: 'Form does not belong to user',
                allowedMentions: DEFAULT_ALLOWED_MENTIONS
            });
            return undefined;
        }
        
        await handleInteractionError(interaction, error, {
            component: 'identity',
            userId: interaction.user.id,
            guildId: interaction.guild?.id,
            channelId: interaction.channel?.id,
            interactionId: interaction.id
        });
        return undefined;
    }
}