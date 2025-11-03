import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType, TextChannel } from 'discord.js';

import { GuildConfigService } from '../services/GuildConfigService';

import type { SlashCommand } from './_loader';

const guildConfigService = new GuildConfigService();

export const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('bot')
        .setDescription('Bot management commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('check-perms')
                .setDescription('Check bot permissions and caller capabilities in a channel')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('The channel to check permissions in (defaults to current channel)')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildAnnouncement)
                )
        ),
    execute: async (interaction) => {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        if (!channel || !(channel instanceof TextChannel)) {
            await interaction.reply({ content: 'Invalid channel specified.', flags: MessageFlags.Ephemeral });
            return;
        }

        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply({ content: 'This command can only be used in a guild.', flags: MessageFlags.Ephemeral });
            return;
        }

        const botMember = guild.members.me;
        if (!botMember) {
            await interaction.reply({ content: 'Bot member not found.', flags: MessageFlags.Ephemeral });
            return;
        }

        const callerMember = interaction.member;
        if (!callerMember) {
            await interaction.reply({ content: 'Caller member not found.', flags: MessageFlags.Ephemeral });
            return;
        }

        // Get bot permissions in the channel
        const botPermissions = channel.permissionsFor(botMember);

        // Get caller permissions in the channel
        const callerPermissions = channel.permissionsFor(interaction.user.id);

        // Get guild config for delete_original_on_proxy
        const config = await guildConfigService.get(guild.id);
        const deleteOriginalOnProxy = config.deleteOriginalOnProxy;

        // Bot required permissions
        const botRequiredPerms = [
            { name: 'ViewChannel', flag: PermissionFlagsBits.ViewChannel, has: botPermissions?.has(PermissionFlagsBits.ViewChannel) ?? false },
            { name: 'SendMessages', flag: PermissionFlagsBits.SendMessages, has: botPermissions?.has(PermissionFlagsBits.SendMessages) ?? false },
            { name: 'ManageWebhooks', flag: PermissionFlagsBits.ManageWebhooks, has: botPermissions?.has(PermissionFlagsBits.ManageWebhooks) ?? false },
        ];

        if (deleteOriginalOnProxy) {
            botRequiredPerms.push({
                name: 'ManageMessages',
                flag: PermissionFlagsBits.ManageMessages,
                has: botPermissions?.has(PermissionFlagsBits.ManageMessages) ?? false
            });
        }

        // Caller capabilities
        const callerCapabilities = [
            { name: 'EmbedLinks', flag: PermissionFlagsBits.EmbedLinks, has: callerPermissions?.has(PermissionFlagsBits.EmbedLinks) ?? false },
            { name: 'AttachFiles', flag: PermissionFlagsBits.AttachFiles, has: callerPermissions?.has(PermissionFlagsBits.AttachFiles) ?? false },
            { name: 'MentionEveryone', flag: PermissionFlagsBits.MentionEveryone, has: callerPermissions?.has(PermissionFlagsBits.MentionEveryone) ?? false },
        ];

        // Build response
        let response = `**Bot Permissions in ${channel}:**\n`;

        for (const perm of botRequiredPerms) {
            const status = perm.has ? '✅' : '❌';
            response += `${status} ${perm.name}\n`;
        }

        response += `\n**Caller Capabilities in ${channel}:**\n`;

        for (const cap of callerCapabilities) {
            const status = cap.has ? '✅' : '❌';
            response += `${status} ${cap.name}\n`;
        }

        // Suggestions
        const missingBotPerms = botRequiredPerms.filter(p => !p.has).map(p => p.name);
        const missingCallerCaps = callerCapabilities.filter(c => !c.has).map(c => c.name);

        if (missingBotPerms.length > 0 || missingCallerCaps.length > 0) {
            response += '\n**Suggestions:**\n';
            if (missingBotPerms.length > 0) {
                response += `- Grant the bot the following permissions: ${missingBotPerms.join(', ')}\n`;
            }
            if (missingCallerCaps.length > 0) {
                response += `- You may need the following permissions for full functionality: ${missingCallerCaps.join(', ')}\n`;
            }
        } else {
            response += '\n**All permissions and capabilities are available!** 🎉';
        }

        await interaction.reply({ content: response, flags: MessageFlags.Ephemeral });
    },
};