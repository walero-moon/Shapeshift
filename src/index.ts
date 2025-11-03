import { Events, Client } from 'discord.js';

import { env } from './config/env';
import { client } from './discord/client';
import { registerInteractionListener } from './discord/listeners/interactionCreate';
import { registerMessageReactionAddListener } from './discord/listeners/messageReactionAdd';
import { logger } from './utils/logger';

const BANNER = `
███████╗██╗  ██╗ █████╗ ██████╗ ███████╗███████╗██╗  ██╗██╗███████╗████████╗
██╔════╝██║  ██║██╔══██╗██╔══██╗██╔════╝██╔════╝██║  ██║██║██╔════╝╚══██╔══╝
███████╗███████║███████║██████╔╝█████╗  ███████╗███████║██║█████╗     ██║   
╚════██║██╔══██║██╔══██║██╔═══╝ ██╔══╝  ╚════██║██╔══██║██║██╔══╝     ██║   
███████║██║  ██║██║  ██║██║     ███████╗███████║██║  ██║██║██║        ██║   
╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝╚═╝        ╚═╝    
`;

const main = async () => {
  console.log(BANNER);
  logger.info('Starting Shapeshifter...');

  await registerInteractionListener(client);
  registerMessageReactionAddListener(client);

  client.once(Events.ClientReady, (readyClient: Client) => {
    logger.info(`Logged in as ${readyClient.user!.tag} (${readyClient.user!.id}).`);
  });

  await client.login(env.DISCORD_TOKEN);

  logger.info(`Login initiated for client ID ${env.CLIENT_ID}.`);
};

main().catch((err) => {
  logger.error('Unhandled error during startup:', err);
  process.exit(1);
});