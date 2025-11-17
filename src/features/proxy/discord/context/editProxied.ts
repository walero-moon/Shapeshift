import { ContextMenuCommandBuilder, MessageContextMenuCommandInteraction, MessageFlags, ApplicationCommandType } from 'discord.js';

export const editProxiedContextCommand = {
    data: new ContextMenuCommandBuilder()
        .setName('Edit proxied message')
        .setType(ApplicationCommandType.Message),
    async execute(interaction: MessageContextMenuCommandInteraction): Promise<void> {
        await interaction.reply({
            content: 'Editing proxied messages via context menu is not available yet.',
            flags: MessageFlags.Ephemeral
        });
    }
};
