import { Client, Events, Interaction, MessageFlags } from 'discord.js';

import { logger } from '../../utils/logger';
import { loadSlashCommands } from '../commands/_loader';
import { loadMessageContextCommands } from '../contexts/_loader';
import { formAutocomplete } from '../commands/_autocomplete/formAutocomplete';
import { FormService } from '../services/FormService';
import { ProxyService } from '../services/ProxyService';
import { permissionGuard } from '../middleware/permissionGuard';
import { handleInteractionError } from '../utils/errorHandler';

const formService = new FormService();
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

        try {
          await command.execute(interaction);
        } catch (error) {
          await handleInteractionError({ interaction, error });
        }
      } else if (interaction.isMessageContextMenuCommand()) {
        const context = messageContexts.get(interaction.commandName);

        if (!context) {
          logger.warn(`No handler found for context menu "${interaction.commandName}".`);
          return;
        }

        try {
          await context.execute(interaction);
        } catch (error) {
          await handleInteractionError({ interaction, error });
        }
      } else if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'proxy' && interaction.options.getSubcommand() === 'send' && interaction.options.getFocused(true).name === 'member') {
          try {
            await formAutocomplete(interaction);
          } catch (error) {
            await handleInteractionError({ interaction, error, silent: true });
          }
        } else if (interaction.commandName === 'form' && (interaction.options.getSubcommand() === 'edit' || interaction.options.getSubcommand() === 'delete') && interaction.options.getFocused(true).name === 'form') {
          try {
            await formAutocomplete(interaction);
          } catch (error) {
            await handleInteractionError({ interaction, error, silent: true });
          }
        }
      } else if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('proxy_as_select_member:')) {
          try {
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
          } catch (error) {
            await handleInteractionError({ interaction, error, customMessage: `Error: ${(error as Error).message}` });
          }
        }
      } else if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('proxy_as_create_member:')) {
          try {
            const [, messageId] = interaction.customId.split(':');
            const memberName = interaction.fields.getTextInputValue('member_name');

            const channel = interaction.channel;
            if (!channel || !channel.isTextBased() || channel.isDMBased()) {
              await interaction.reply({ content: 'Invalid channel.', flags: MessageFlags.Ephemeral });
              return;
            }

            const targetMessage = await channel.messages.fetch(messageId);
            if (!targetMessage) {
              await interaction.reply({ content: 'Message not found.', flags: MessageFlags.Ephemeral });
              return;
            }

            const member = await formService.addForm(interaction.user.id, memberName);

            const guildMember = await interaction.guild!.members.fetch(interaction.user.id);
            const attachments = targetMessage.attachments.map(a => a);
            const shaped = permissionGuard({
              member: guildMember,
              channel,
              source: { content: targetMessage.content, attachments },
            });

            if (!shaped) {
              await interaction.reply({ content: 'Insufficient permissions.', flags: MessageFlags.Ephemeral });
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
            await interaction.reply({ content: 'Member created and message proxied successfully.', flags: MessageFlags.Ephemeral });
          } catch (error) {
            await handleInteractionError({ interaction, error, customMessage: `Error: ${(error as Error).message}` });
          }
        }
      }
    } catch (error) {
      await handleInteractionError({ interaction, error });
    }
  });

  logger.info(
    `Registered ${slashCommands.size} slash command(s) and ${messageContexts.size} message context menu(s).`,
  );
};
