import { Events } from 'discord.js';
import { client } from './adapters/discord/client';
import { registry } from './adapters/discord/registry';
import { command as pingCommand } from './features/health/discord/ping';
import log from './shared/utils/logger';

// Register commands with the registry
import { command as formCommand } from './features/identity/discord/form';
import { command as aliasCommand } from './features/identity/discord/alias';

registry.registerCommand(formCommand);
registry.registerCommand(aliasCommand);
registry.registerCommand(pingCommand);

// Enhanced ready event with comprehensive logging
client.once(Events.ClientReady, (readyClient) => {
    log.info(`
🚀 ======================================= 🚀
███████╗██╗  ██╗ █████╗ ██████╗ ███████╗███████╗██╗  ██╗██╗███████╗████████╗
██╔════╝██║  ██║██╔══██╗██╔══██╗██╔════╝██╔════╝██║  ██║██║██╔════╝╚══██╔══╝
███████╗███████║███████║██████╔╝█████╗  ███████╗███████║██║█████╗     ██║
╚════██║██╔══██║██╔══██║██╔═══╝ ██╔══╝  ╚════██║██╔══██║██║██╔══╝     ██║
███████║██║  ██║██║  ██║██║     ███████╗███████║██║  ██║██║██║        ██║
╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝╚═╝        ╚═╝
🚀 ======================================= 🚀
✅ Bot is ready! Logged in as ${readyClient.user.tag}
🆔 Bot ID: ${readyClient.user.id}
🏠 Connected to ${readyClient.guilds.cache.size} guild(s)
👥 Serving ${readyClient.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)} total members
🕐 Started at: ${new Date().toLocaleString()}
🚀 ======================================= 🚀
    `, {
        component: 'bot',
        status: 'ready',
        guilds: readyClient.guilds.cache.size,
        members: readyClient.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)
    });
});

// Enhanced interaction handler with better error handling and logging
client.on(Events.InteractionCreate, async (interaction) => {
    const interactionLogger = log.child({
        component: 'interaction',
        userId: interaction.user.id,
        interactionId: interaction.id,
        guildId: interaction.guild?.id,
        channelId: interaction.channel?.id,
    });

    try {
        if (interaction.isChatInputCommand()) {
            const command = registry.getCommand(interaction.commandName);

            if (!command) {
                interactionLogger.warn(`Command not found in registry`, {
                    route: interaction.commandName,
                    status: 'not_found'
                });
                return;
            }

            interactionLogger.info(`Executing command`, {
                route: interaction.commandName,
                subcommand: interaction.options.getSubcommand(),
                options: interaction.options.data,
                status: 'executing'
            });

            // Execute command with enhanced error handling
            await command.execute(interaction);

            interactionLogger.info(`Command executed successfully`, {
                route: interaction.commandName,
                status: 'success'
            });
        } else if (interaction.isAutocomplete()) {
            const handler = registry.getAutocompleteHandler(interaction.commandName);
            if (handler) {
                await handler(interaction);
            }
        } else if (interaction.isButton()) {
            const handler = registry.getButtonHandler(interaction.customId);
            if (handler) {
                await handler(interaction);
            }
        } else if (interaction.isModalSubmit()) {
            const handler = registry.getModalHandler(interaction.customId);
            if (handler) {
                await handler(interaction);
            }
        }
    } catch (error) {
        interactionLogger.error(`Error executing interaction`, {
            error: error instanceof Error ? error.message : String(error),
            status: 'error'
        });

        // Provide more user-friendly error messages
        const errorMessage = {
            content: '🚫 There was an error while executing this interaction! Please try again later.',
            ephemeral: true
        };

        // Try to respond appropriately based on interaction state
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
            await interaction.reply(errorMessage);
        } else if (interaction.isRepliable()) {
            await interaction.followUp(errorMessage);
        }
    }
});

// Enhanced error handling for various events
client.on(Events.Error, (error) => {
    log.error('Discord client error', {
        component: 'discord',
        error: error.message,
        status: 'error'
    });
});

client.on(Events.Warn, (warning) => {
    log.warn('Discord client warning', {
        component: 'discord',
        warning: warning,
        status: 'warning'
    });
});

// Graceful shutdown handling
process.on('SIGINT', () => {
    log.info('Received SIGINT. Gracefully shutting down...', {
        component: 'bot',
        status: 'shutdown'
    });
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    log.info('Received SIGTERM. Gracefully shutting down...', {
        component: 'bot',
        status: 'shutdown'
    });
    client.destroy();
    process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled Rejection', {
        component: 'process',
        reason: reason instanceof Error ? reason.message : String(reason),
        promise: String(promise),
        status: 'fatal'
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    log.fatal('Uncaught Exception', {
        component: 'process',
        error: error.message,
        status: 'fatal'
    });
    process.exit(1);
});

log.info('Initializing Shapeshift Discord Bot...', {
    component: 'bot',
    status: 'initializing'
});