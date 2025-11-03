import { SlashCommandBuilder, MessageFlags } from 'discord.js';

import type { SlashCommand } from './_loader';
import { MemberService } from '../services/MemberService';

const memberService = new MemberService();

export const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('member')
        .setDescription('Manage your members')
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a new member')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('Name of the member')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('avatar_url')
                        .setDescription('Avatar URL for the member')
                )
        ),
    execute: async (interaction) => {
        if (interaction.options.getSubcommand() !== 'add') {
            await interaction.reply({ content: 'Unknown subcommand.', flags: MessageFlags.Ephemeral });
            return;
        }

        const name = interaction.options.getString('name')?.trim();
        const avatarUrl = interaction.options.getString('avatar_url') || undefined;
        const userId = interaction.user.id;

        try {
            await memberService.addMember(userId, name!, avatarUrl);
            await interaction.reply({ content: 'Member added successfully!', flags: MessageFlags.Ephemeral });
        } catch (error: any) {
            if (error.message === 'Owner does not have a system') {
                await interaction.reply({ content: 'You don\'t have a system yet. Please run `/system create` to create one.', flags: MessageFlags.Ephemeral });
            } else if (error.message === 'Invalid avatar URL scheme') {
                await interaction.reply({ content: 'Invalid avatar URL. Please provide a valid HTTP or HTTPS URL.', flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: 'An error occurred while adding the member.', flags: MessageFlags.Ephemeral });
            }
        }
    },
};