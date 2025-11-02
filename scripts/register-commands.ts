import { REST, Routes } from 'discord.js';

import { env } from '../src/config/env';
import { loadSlashCommands } from '../src/discord/commands/_loader';
import { loadMessageContextCommands } from '../src/discord/contexts/_loader';
import { logger } from '../src/utils/logger';

const resolveRegistrationScope = () => {
  const isGlobal = process.argv.includes('--global');

  if (isGlobal) {
    return { type: 'global' as const };
  }

  if (!env.DEV_GUILD_ID) {
    throw new Error('DEV_GUILD_ID must be set to register guild commands. Set it in your .env file or use --global flag.');
  }

  return { type: 'guild' as const, guildId: env.DEV_GUILD_ID };
};

const main = async () => {
  const [slashCommands, messageContexts] = await Promise.all([
    loadSlashCommands(),
    loadMessageContextCommands(),
  ]);

  const payload = [
    ...Array.from(slashCommands.values(), (command) => command.data.toJSON()),
    ...Array.from(messageContexts.values(), (context) => context.data.toJSON()),
  ];

  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
  const scope = resolveRegistrationScope();

  if (scope.type === 'global') {
    await rest.put(Routes.applicationCommands(env.CLIENT_ID), { body: payload });
    logger.info(`Registered ${payload.length} command(s) globally.`);
  } else {
    await rest.put(Routes.applicationGuildCommands(env.CLIENT_ID, scope.guildId), {
      body: payload,
    });
    logger.info(`Registered ${payload.length} command(s) to guild ${scope.guildId}.`);
  }
};

main().catch((error) => {
  logger.error('Failed to register application commands', error);
  process.exit(1);
});
