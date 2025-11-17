import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { env } from '../../config/env';
import { log } from '../../shared/utils/logger';

const component = 'clear-commands';

async function clearGuildCommands(rest: REST) {
    log.info('Clearing development guild commands', {
        component,
        guildId: env.DEV_GUILD_ID,
        scope: 'guild',
        status: 'start'
    });

    await rest.put(
        Routes.applicationGuildCommands(env.APPLICATION_ID, env.DEV_GUILD_ID),
        { body: [] }
    );

    log.info('Removed all development guild commands', {
        component,
        guildId: env.DEV_GUILD_ID,
        scope: 'guild',
        status: 'success'
    });
}

async function clearGlobalCommands(rest: REST) {
    log.info('Clearing global commands', {
        component,
        scope: 'global',
        status: 'start'
    });

    await rest.put(
        Routes.applicationCommands(env.APPLICATION_ID),
        { body: [] }
    );

    log.info('Removed all global commands', {
        component,
        scope: 'global',
        status: 'success'
    });
}

async function main() {
    const rest = new REST({ version: '10' }).setToken(env.BOT_TOKEN);

    await Promise.all([
        clearGuildCommands(rest),
        clearGlobalCommands(rest)
    ]);
}

main().catch((error) => {
    log.error('Failed to clear commands', {
        component,
        error: error instanceof Error ? error.message : String(error),
        status: 'error'
    });
    process.exit(1);
});
