import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction } from 'discord.js';

export const command = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),
    execute: async (interaction: CommandInteraction) => {
        await interaction.reply({ content: 'Pong!', ephemeral: true });
    }
};