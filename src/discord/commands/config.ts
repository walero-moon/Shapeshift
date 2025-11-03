import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType } from 'discord.js';

import { GuildConfigService } from '../services/GuildConfigService';

import type { SlashCommand } from './_loader';

const guildConfigService = new GuildConfigService();

export const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Manage guild configuration')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommandGroup(group =>
            group
                .setName('log-channel')
                .setDescription('Manage log channel settings')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('set')
                        .setDescription('Set the log channel')
                        .addChannelOption(option =>
                            option
                                .setName('channel')
                                .setDescription('The channel to set as log channel')
                                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('clear')
                        .setDescription('Clear the log channel')
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('proxy')
                .setDescription('Manage proxy settings')
                .addStringOption(option =>
                    option
                        .setName('delete-original')
                        .setDescription('Whether to delete original messages on proxy')
                        .addChoices(
                            { name: 'on', value: 'on' },
                            { name: 'off', value: 'off' }
                        )
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('tag-proxy')
                .setDescription('Enable or disable tag proxy')
                .addStringOption(option =>
                    option
                        .setName('action')
                        .setDescription('Enable or disable tag proxy')
                        .addChoices(
                            { name: 'enable', value: 'enable' },
                            { name: 'disable', value: 'disable' }
                        )
                        .setRequired(true)
                )
        ),
    execute: async (interaction) => {
        const guildId = interaction.guildId!;
        const subcommandGroup = interaction.options.getSubcommandGroup(false);
        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommandGroup === 'log-channel') {
                if (subcommand === 'set') {
                    const channel = interaction.options.getChannel('channel', true);
                    await guildConfigService.setLogChannel(guildId, channel.id);
                    await interaction.reply({ content: `Log channel set to ${channel}.`, flags: MessageFlags.Ephemeral });
                } else if (subcommand === 'clear') {
                    await guildConfigService.setLogChannel(guildId, null);
                    await interaction.reply({ content: 'Log channel cleared.', flags: MessageFlags.Ephemeral });
                }
            } else if (subcommand === 'proxy') {
                const deleteOriginal = interaction.options.getString('delete-original', true);
                const on = deleteOriginal === 'on';
                await guildConfigService.setDeleteOriginal(guildId, on);
                await interaction.reply({ content: `Delete original on proxy ${on ? 'enabled' : 'disabled'}.`, flags: MessageFlags.Ephemeral });
            } else if (subcommand === 'tag-proxy') {
                const action = interaction.options.getString('action', true);
                const on = action === 'enable';
                await guildConfigService.setTagProxyEnabled(guildId, on);
                await interaction.reply({ content: `Tag proxy ${on ? 'enabled' : 'disabled'}.`, flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: 'Unknown subcommand.', flags: MessageFlags.Ephemeral });
            }
        } catch {
            await interaction.reply({ content: 'An error occurred while updating configuration. Please try again later.', flags: MessageFlags.Ephemeral });
        }
    },
};