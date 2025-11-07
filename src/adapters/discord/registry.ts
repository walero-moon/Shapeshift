import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { env } from '../../config/env';

import { CommandInteraction, AutocompleteInteraction, ButtonInteraction, ModalSubmitInteraction } from 'discord.js';

export interface Command {
    data: {
        name: string;
        toJSON(): unknown;
    };
    execute(interaction: CommandInteraction): Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export class CommandRegistry {
    private commands: Map<string, Command> = new Map();
    private autocompleteHandlers: Map<string, (interaction: AutocompleteInteraction) => Promise<void>> = new Map();
    private buttonHandlers: Map<string, (interaction: ButtonInteraction) => Promise<void>> = new Map();
    private modalHandlers: Map<string, (interaction: ModalSubmitInteraction) => Promise<void>> = new Map();
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

    registerAutocomplete(commandName: string, handler: (interaction: AutocompleteInteraction) => Promise<void>) {
        this.autocompleteHandlers.set(commandName, handler);
    }

    registerButton(prefix: string, handler: (interaction: ButtonInteraction) => Promise<void>) {
        this.buttonHandlers.set(prefix, handler);
    }

    registerModal(prefix: string, handler: (interaction: ModalSubmitInteraction) => Promise<void>) {
        this.modalHandlers.set(prefix, handler);
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

    getAutocompleteHandler(commandName: string) {
        return this.autocompleteHandlers.get(commandName);
    }

    getButtonHandler(customId: string) {
        for (const [prefix, handler] of this.buttonHandlers) {
            if (customId.startsWith(prefix)) return handler;
        }
        return undefined;
    }

    getModalHandler(customId: string) {
        for (const [prefix, handler] of this.modalHandlers) {
            if (customId.startsWith(prefix)) return handler;
        }
        return undefined;
    }
}

export const registry = new CommandRegistry();

// Register handlers
import { execute as formAutocompleteExecute } from '../../features/identity/discord/form.autocomplete';
import { handleButtonInteraction as formListHandleButton } from '../../features/identity/discord/form.list';
import { handleModalSubmit as formEditHandleModal } from '../../features/identity/discord/form.edit';
import { execute as aliasAutocompleteExecute } from '../../features/identity/discord/alias.autocomplete';
import { handleButtonInteraction as aliasListHandleButton } from '../../features/identity/discord/alias.list';

registry.registerAutocomplete('form', formAutocompleteExecute);
registry.registerButton('form_list', formListHandleButton);
registry.registerModal('edit_form', formEditHandleModal);
registry.registerAutocomplete('alias', aliasAutocompleteExecute);
registry.registerButton('alias_list', aliasListHandleButton);