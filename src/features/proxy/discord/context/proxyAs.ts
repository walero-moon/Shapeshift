import { ContextMenuCommandBuilder, MessageContextMenuCommandInteraction, MessageFlags, ApplicationCommandType } from 'discord.js';

export const proxyAsContextCommand = {
    data: new ContextMenuCommandBuilder()
        .setName('Proxy as')
        .setType(ApplicationCommandType.Message),
    async execute(interaction: MessageContextMenuCommandInteraction): Promise<void> {
        await interaction.reply({
            content: 'Proxy-as context menu support is coming soon.',
            flags: MessageFlags.Ephemeral
        });
    }
};
