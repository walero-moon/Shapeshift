import { SlashCommandBuilder, CommandInteraction, Message } from 'discord.js';

export const command = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),
    execute: async (interaction: CommandInteraction): Promise<Message<boolean> | undefined> => {
        await interaction.deferReply({ ephemeral: true });
        return await interaction.editReply({ content: 'Pong!' });
    }
};