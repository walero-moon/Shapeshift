import { ApplicationCommandType, ContextMenuCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

import { MemberService } from '../services/MemberService';
import type { MessageContextCommand } from './_loader';

const memberService = new MemberService();

/**
 * Context menu command to proxy as a member using an existing message.
 */
export const context: MessageContextCommand = {
    data: new ContextMenuCommandBuilder()
        .setName('Proxy as...')
        .setType(ApplicationCommandType.Message)
        .setDMPermission(false),
    execute: async (interaction) => {
        const targetMessage = interaction.targetMessage;

        if (targetMessage.author.id !== interaction.user.id) {
            await interaction.reply({
                content: 'You can only proxy your own messages.',
                ephemeral: true,
            });
            return;
        }

        const members = await memberService.getMembers(interaction.user.id);

        if (members.length === 0) {
            const modal = new ModalBuilder()
                .setCustomId(`proxy_as_create_member:${targetMessage.id}`)
                .setTitle('Create Member');

            const nameInput = new TextInputBuilder()
                .setCustomId('member_name')
                .setLabel('Member Name')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const row = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
            modal.addComponents(row);

            await interaction.showModal(modal);
            return;
        }

        const select = new StringSelectMenuBuilder()
            .setCustomId(`proxy_as_select_member:${targetMessage.id}`)
            .setPlaceholder('Select member to proxy as');

        for (const member of members) {
            select.addOptions({
                label: member.name,
                value: member.id.toString(),
            });
        }

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

        await interaction.reply({
            components: [row],
            ephemeral: true,
        });

        const message = await interaction.fetchReply();
        const collector = message.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (i) => {
            await i.deferUpdate();
            // Handled in interactionCreate
        });

        collector.on('end', (collected) => {
            if (collected.size === 0) {
                interaction.editReply({
                    content: 'Selection timed out.',
                    components: [],
                });
            }
        });
    },
};