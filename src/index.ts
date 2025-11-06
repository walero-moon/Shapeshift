import { Client, Events, PermissionFlagsBits, ChatInputCommandInteraction } from 'discord.js';
import { client } from './adapters/discord/client';
import { registry } from './adapters/discord/registry';
import { command as pingCommand } from './features/health/discord/ping';

// Register commands with the registry
registry.registerCommand(pingCommand);

// Enhanced ready event with comprehensive logging
client.once(Events.ClientReady, (readyClient) => {
    console.log(`
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
📊 Uptime: ${Math.floor(process.uptime())}s
🕐 Started at: ${new Date().toLocaleString()}
🚀 ======================================= 🚀
    `);
});

// Enhanced interaction handler with better error handling and logging
client.on(Events.InteractionCreate, async (interaction) => {
    try {
        // Skip non-command interactions
        if (!interaction.isChatInputCommand()) return;

        const command = registry.getCommand(interaction.commandName);

        if (!command) {
            console.warn(`❌ Command '${interaction.commandName}' not found in registry`);
            return;
        }

        console.log(`📝 Executing command: /${interaction.commandName} by ${interaction.user.tag} (${interaction.user.id})`);

        // Execute command with enhanced error handling
        await command.execute(interaction as ChatInputCommandInteraction);

        console.log(`✅ Command /${interaction.commandName} executed successfully`);
    } catch (error) {
        console.error(`❌ Error executing unknown command:`, error);

        // Provide more user-friendly error messages
        const errorMessage = {
            content: '🚫 There was an error while executing this command! Please try again later.',
            ephemeral: true
        };

        // Try to respond appropriately based on interaction state
        const chatInteraction = interaction as ChatInputCommandInteraction;
        if (chatInteraction.replied || chatInteraction.deferred) {
            await chatInteraction.followUp(errorMessage);
        } else {
            await chatInteraction.reply(errorMessage);
        }
    }
});

// Enhanced error handling for various events
client.on(Events.Error, (error) => {
    console.error('🔴 Discord client error:', error);
});

client.on(Events.Warn, (warning) => {
    console.warn('🟡 Discord client warning:', warning);
});

// Graceful shutdown handling
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT. Gracefully shutting down...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM. Gracefully shutting down...');
    client.destroy();
    process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('🚨 Uncaught Exception:', error);
    process.exit(1);
});

console.log('🔧 Initializing Shapeshift Discord Bot...');