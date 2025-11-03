import { Client, Events, Interaction } from 'discord.js';

import { logger } from '../../utils/logger';
import { loadSlashCommands } from '../commands/_loader';
import { loadMessageContextCommands } from '../contexts/_loader';
import { memberAutocomplete } from '../commands/_autocomplete/memberAutocomplete';
import { MemberService } from '../services/MemberService';
import { ProxyService } from '../services/ProxyService';
import { permissionGuard } from '../middleware/permissionGuard';

const memberService = new MemberService();
const proxyService = new ProxyService();

export const registerInteractionListener = async (client: Client) => {
  const [slashCommands, messageContexts] = await Promise.all([
    loadSlashCommands(),
    loadMessageContextCommands(),
  ]);

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = slashCommands.get(interaction.commandName);

        if (!command) {
          logger.warn(`No handler found for slash command "${interaction.commandName}".`);
          return;
        }

        await command.execute(interaction);
      } else if (interaction.isMessageContextMenuCommand()) {
        const context = messageContexts.get(interaction.commandName);

        if (!context) {
          logger.warn(`No handler found for context menu "${interaction.commandName}".`);
          return;
        }

        await context.execute(interaction);
      } else if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'proxy' && interaction.options.getSubcommand() === 'send' && interaction.options.getFocused(true).name === 'member') {
          await memberAutocomplete(interaction);
        }
      } else if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('proxy_as_select_member:')) {
          const [, messageId] = interaction.customId.split(':');
          const memberId = parseInt(interaction.values[0], 10);

          const channel = interaction.channel;
          if (!channel || !channel.isTextBased() || channel.isDMBased()) {
            await interaction.update({ content: 'Invalid channel.', components: [] });
            return;
          }

          const targetMessage = await channel.messages.fetch(messageId);
          if (!targetMessage) {
            await interaction.update({ content: 'Message not found.', components: [] });
            return;
          }

          const guildMember = await interaction.guild!.members.fetch(interaction.user.id);
          const attachments = targetMessage.attachments.map(a => a);
          const shaped = permissionGuard({
            member: guildMember,
            channel,
            source: { content: targetMessage.content, attachments },
          });

          if (!shaped) {
            await interaction.editReply({ content: 'Insufficient permissions.', components: [] });
            return;
          }

          try {
            await proxyService.sendProxied({
              actorUserId: interaction.user.id,
              memberId,
              channel,
              content: targetMessage.content,
              attachments: shaped.files,
              originalMessageId: targetMessage.id,
            });

            await targetMessage.delete();
            await interaction.editReply({ content: 'Message proxied successfully.', components: [] });
          } catch (error: any) {
            await interaction.editReply({ content: `Error: ${error.message}`, components: [] });
          }
        }
      } else if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('proxy_as_create_member:')) {
          const [, messageId] = interaction.customId.split(':');
          const memberName = interaction.fields.getTextInputValue('member_name');

          const channel = interaction.channel;
          if (!channel || !channel.isTextBased() || channel.isDMBased()) {
            await interaction.reply({ content: 'Invalid channel.', ephemeral: true });
            return;
          }

          const targetMessage = await channel.messages.fetch(messageId);
          if (!targetMessage) {
            await interaction.reply({ content: 'Message not found.', ephemeral: true });
            return;
          }

          try {
            const member = await memberService.addMember(interaction.user.id, memberName);

            const guildMember = await interaction.guild!.members.fetch(interaction.user.id);
            const attachments = targetMessage.attachments.map(a => a);
            const shaped = permissionGuard({
              member: guildMember,
              channel,
              source: { content: targetMessage.content, attachments },
            });

            if (!shaped) {
              await interaction.reply({ content: 'Insufficient permissions.', ephemeral: true });
              return;
            }

            await proxyService.sendProxied({
              actorUserId: interaction.user.id,
              memberId: member.id,
              channel,
              content: targetMessage.content,
              attachments: shaped.files,
              originalMessageId: targetMessage.id,
            });

            await targetMessage.delete();
            await interaction.reply({ content: 'Member created and message proxied successfully.', ephemeral: true });
          } catch (error: any) {
            await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
          }
        }
      }
    } catch (error) {
      logger.error('Error while handling interaction', error);

      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'Something went wrong while handling that interaction. Please try again later.',
          ephemeral: true,
        });
      }
    }
  });

  logger.info(
    `Registered ${slashCommands.size} slash command(s) and ${messageContexts.size} message context menu(s).`,
  );
};
