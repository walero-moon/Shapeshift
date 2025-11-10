import { SlashCommandSubcommandBuilder, ChatInputCommandInteraction, MessageFlags, Message } from 'discord.js';
import { removeAlias } from '../app/RemoveAlias';
import { DEFAULT_ALLOWED_MENTIONS } from '../../../shared/utils/allowedMentions';
import { handleInteractionError } from '../../../shared/utils/errorHandling';

export const data = new SlashCommandSubcommandBuilder()
    .setName('remove')
    .setDescription('Remove an alias by ID')
    .addStringOption(option =>
        option.setName('id')
            .setDescription('The ID of the alias to remove')
            .setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<Message<boolean> | undefined> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const aliasId = interaction.options.getString('id', true);

    try {
        await removeAlias(aliasId, interaction.user.id);

        return await interaction.editReply({
            content: `✅ Alias removed successfully!`,
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