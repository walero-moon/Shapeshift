import { registry } from './registry';

const scope = process.argv[2] as 'guild' | 'global';

if (!scope || (scope !== 'guild' && scope !== 'global')) {
    console.error('Usage: ts-node src/adapters/discord/register-commands.ts <guild|global>');
    process.exit(1);
}

registry.deployCommands(scope)
    .then(() => {
        console.log(`Commands deployed to ${scope} scope successfully.`);
    })
    .catch((error) => {
        console.error('Error deploying commands:', error);
        process.exit(1);
    });