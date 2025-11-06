import { Client, GatewayIntentBits } from 'discord.js';
import { env } from '../../config/env';

export const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.login(env.BOT_TOKEN);