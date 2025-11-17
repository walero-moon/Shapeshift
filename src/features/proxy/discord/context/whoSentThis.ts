import { ContextMenuCommandBuilder, MessageContextMenuCommandInteraction, MessageFlags, ApplicationCommandType } from 'discord.js';

export const whoSentThisContextCommand = {
    data: new ContextMenuCommandBuilder()
        .setName('Who sent this')
        .setType(ApplicationCommandType.Message),
    async execute(interaction: MessageContextMenuCommandInteraction): Promise<void> {
        await interaction.reply({
            content: 'Authorship lookup for proxied messages is coming soon.',
            flags: MessageFlags.Ephemeral
        });
    }
};
