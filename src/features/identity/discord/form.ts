import { SlashCommandBuilder, ChatInputCommandInteraction, Message } from 'discord.js';
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
    execute: async (interaction: ChatInputCommandInteraction): Promise<Message<boolean> | undefined> => {
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'add':
                    return await addExecute(interaction);
                case 'edit':
                    await editExecute(interaction);
                    return undefined;
                case 'delete':
                    return await deleteExecute(interaction);
                case 'list':
                    return await listExecute(interaction);
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