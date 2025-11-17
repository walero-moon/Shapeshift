import { ContextMenuCommandBuilder, MessageContextMenuCommandInteraction, MessageFlags, ApplicationCommandType } from 'discord.js';

export const deleteProxiedContextCommand = {
    data: new ContextMenuCommandBuilder()
        .setName('Delete proxied message')
        .setType(ApplicationCommandType.Message),
    async execute(interaction: MessageContextMenuCommandInteraction): Promise<void> {
        await interaction.reply({
            content: 'Deleting proxied messages via context menu is not available yet.',
            flags: MessageFlags.Ephemeral
        });
    }
};
