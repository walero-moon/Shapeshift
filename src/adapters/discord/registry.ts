import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { env } from '../../config/env';

import { CommandInteraction } from 'discord.js';

export interface Command {
    data: {
        name: string;
        toJSON(): unknown;
    };
    execute(interaction: CommandInteraction): Promise<void>;
}

export class CommandRegistry {
    private commands: Map<string, Command> = new Map();
    private rest: REST;

    constructor() {
        this.rest = new REST({ version: '10' }).setToken(env.BOT_TOKEN);
    }

    registerCommand(command: Command) {
        this.commands.set(command.data.name, command);
    }

    unregisterCommand(name: string) {
        this.commands.delete(name);
    }

    async deployCommands(scope: 'guild' | 'global') {
        const commands = Array.from(this.commands.values()).map(cmd => cmd.data.toJSON());

        if (scope === 'guild') {
            await this.rest.put(
                Routes.applicationGuildCommands(env.APPLICATION_ID, env.DEV_GUILD_ID),
                { body: commands }
            );
        } else {
            await this.rest.put(
                Routes.applicationCommands(env.APPLICATION_ID),
                { body: commands }
            );
        }
    }

    getCommand(name: string) {
        return this.commands.get(name);
    }
}

export const registry = new CommandRegistry();