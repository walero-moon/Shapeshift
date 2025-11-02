import { Client, Events, Interaction } from 'discord.js';

import { logger } from '../../utils/logger';
import { loadSlashCommands } from '../commands/_loader';
import { loadMessageContextCommands } from '../contexts/_loader';

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
