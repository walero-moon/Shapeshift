import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction, MessageFlags, Message } from 'discord.js';
import { addAlias } from '../app/AddAlias';
import { DEFAULT_ALLOWED_MENTIONS } from '../../../shared/utils/allowedMentions';
import { handleInteractionError } from '../../../shared/utils/errorHandling';

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

        return await interaction.editReply({
            content: `✅ Alias "${result.triggerRaw}" added successfully!`,
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