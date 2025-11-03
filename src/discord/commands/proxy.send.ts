import { SlashCommandBuilder, MessageFlags } from 'discord.js';

import type { SlashCommand } from './_loader';
import { ProxyService } from '../services/ProxyService';
import { permissionGuard } from '../middleware/permissionGuard';

const proxyService = new ProxyService();

/**
 * /proxy send command implementation.
 * Sends a proxied message using the specified member.
 */
export const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('proxy')
        .setDescription('Proxy commands')
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('send')
                .setDescription('Send a proxied message')
                .addStringOption(option =>
                    option
                        .setName('member')
                        .setDescription('Member to proxy as')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName('text')
                        .setDescription('Message text')
                        .setRequired(true)
                )
                .addAttachmentOption(option =>
                    option
                        .setName('file1')
                        .setDescription('First attachment')
                )
                .addAttachmentOption(option =>
                    option
                        .setName('file2')
                        .setDescription('Second attachment')
                )
                .addAttachmentOption(option =>
                    option
                        .setName('file3')
                        .setDescription('Third attachment')
                )
        ),
    execute: async (interaction) => {
        if (interaction.options.getSubcommand() !== 'send') {
            await interaction.reply({ content: 'Unknown subcommand.', flags: MessageFlags.Ephemeral });
            return;
        }

        const memberIdStr = interaction.options.getString('member');
        const text = interaction.options.getString('text');
        const file1 = interaction.options.getAttachment('file1');
        const file2 = interaction.options.getAttachment('file2');
        const file3 = interaction.options.getAttachment('file3');

        if (!memberIdStr || !text) {
            await interaction.reply({ content: 'Member and text are required.', flags: MessageFlags.Ephemeral });
            return;
        }

        const memberId = parseInt(memberIdStr, 10);
        if (isNaN(memberId)) {
            await interaction.reply({ content: 'Invalid member ID.', flags: MessageFlags.Ephemeral });
            return;
        }

        const attachments = [file1, file2, file3].filter(Boolean);

        try {
            const channel = interaction.channel;
            if (!channel || !channel.isTextBased() || channel.isDMBased()) {
                await interaction.reply({ content: 'This command can only be used in guild text channels.', flags: MessageFlags.Ephemeral });
                return;
            }

            const guildMember = await interaction.guild!.members.fetch(interaction.user.id);
            const shaped = permissionGuard({
                member: guildMember,
                channel,
                source: { content: text, attachments },
            });

            if (!shaped) {
                await interaction.reply({ content: 'Insufficient permissions to send message.', flags: MessageFlags.Ephemeral });
                return;
            }

            const result = await proxyService.sendProxied({
                actorUserId: interaction.user.id,
                memberId,
                channel,
                content: text,
                attachments,
                originalMessageId: interaction.id,
            });

            // Reply with link to the proxied message
            const messageLink = `https://discord.com/channels/${interaction.guild!.id}/${result.channelId}/${result.messageId}`;
            await interaction.reply({ content: `Message sent: ${messageLink}`, flags: MessageFlags.Ephemeral });
        } catch (error: any) {
            if (error.message === 'Insufficient permissions to send message') {
                await interaction.reply({ content: 'Insufficient permissions to send message.', flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: 'An error occurred while sending the message.', flags: MessageFlags.Ephemeral });
            }
        }
    },
};