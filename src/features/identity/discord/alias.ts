import { SlashCommandBuilder, ChatInputCommandInteraction, Message } from 'discord.js';
import { data as addData, execute as addExecute } from './alias.add';
import { data as listData, execute as listExecute } from './alias.list';
import { data as removeData, execute as removeExecute } from './alias.remove';
import { execute as autocompleteExecute } from './alias.autocomplete';
import { handleInteractionError } from '../../../shared/utils/errorHandling';

export const command = {
    data: new SlashCommandBuilder()
        .setName('alias')
        .setDescription('Manage your aliases')
        .addSubcommand(addData)
        .addSubcommand(listData)
        .addSubcommand(removeData),
    execute: async (interaction: ChatInputCommandInteraction): Promise<Message<boolean> | undefined> => {
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'add':
                    return addExecute(interaction);
                case 'list':
                    return listExecute(interaction);
                case 'remove':
                    return removeExecute(interaction);
                default:
                    await interaction.deferReply({ ephemeral: true });
                    return await interaction.editReply({
                        content: 'Unknown subcommand.'
                    });
            }
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
    },
    autocomplete: autocompleteExecute
};