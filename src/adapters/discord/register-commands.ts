import { registry } from './registry';
import { command as pingCommand } from '../../features/health/discord/ping';
import { command as formCommand } from '../../features/identity/discord/form';
import { command as aliasCommand } from '../../features/identity/discord/alias';
import { command as sendCommand } from '../../features/proxy/discord/send';
import { proxyAsContextCommand } from '../../features/proxy/discord/context/proxyAs';
import { editProxiedContextCommand } from '../../features/proxy/discord/context/editProxied';
import { deleteProxiedContextCommand } from '../../features/proxy/discord/context/deleteProxied';
import { whoSentThisContextCommand } from '../../features/proxy/discord/context/whoSentThis';

// Register commands before deploying
registry.registerCommand(pingCommand);
registry.registerCommand(formCommand);
registry.registerCommand(aliasCommand);
registry.registerCommand(sendCommand);
registry.registerMessageCommand(proxyAsContextCommand);
registry.registerMessageCommand(editProxiedContextCommand);
registry.registerMessageCommand(deleteProxiedContextCommand);
registry.registerMessageCommand(whoSentThisContextCommand);

const scope = process.argv[2] as 'guild' | 'global';

import { log } from '../../shared/utils/logger';

if (!scope || (scope !== 'guild' && scope !== 'global')) {
    log.error('Invalid usage', {
        component: 'register-commands',
        usage: 'ts-node src/adapters/discord/register-commands.ts <guild|global>',
        status: 'error'
    });
    process.exit(1);
}

registry.deployCommands(scope)
    .then(() => {
        log.info(`Commands deployed successfully`, {
            component: 'register-commands',
            scope,
            status: 'success'
        });
    })
    .catch((error) => {
        log.error('Error deploying commands', {
            component: 'register-commands',
            scope,
            error: error.message,
            status: 'error'
        });
        process.exit(1);
    });
