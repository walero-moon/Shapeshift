import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { data as addData, execute as addExecute } from './form.add';
import { data as editData, execute as editExecute } from './form.edit';
import { data as deleteData, execute as deleteExecute } from './form.delete';
import { data as listData, execute as listExecute } from './form.list';
import { execute as autocompleteExecute } from './form.autocomplete';
import { handleInteractionError } from '../../../shared/utils/errorHandling';

export const command = {
    data: new SlashCommandBuilder()
        .setName('form')
        .setDescription('Manage your forms')
        .addSubcommand(addData)
        .addSubcommand(editData)
        .addSubcommand(deleteData)
        .addSubcommand(listData),
    execute: async (interaction: ChatInputCommandInteraction) => {
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'add':
                    return addExecute(interaction);
                case 'edit':
                    return editExecute(interaction);
                case 'delete':
                    return deleteExecute(interaction);
                case 'list':
                    return listExecute(interaction);
                default:
                    return interaction.reply({
                        content: 'Unknown subcommand.',
                        ephemeral: true
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
        }
    },
    autocomplete: autocompleteExecute
};