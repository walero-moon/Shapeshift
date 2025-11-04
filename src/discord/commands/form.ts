import { SlashCommandBuilder, MessageFlags, InteractionContextType } from 'discord.js';

import { FormService } from '../services/FormService';
import { ProxyService } from '../services/ProxyService';

// Import handlers
import * as manage from './form/manage';
import * as modes from './form/handlers/modes';
import * as sendHandler from './form/handlers/send';
import * as aliasAdd from './form/handlers/alias/add';
import * as aliasList from './form/handlers/alias/list';
import * as aliasRemove from './form/handlers/alias/remove';
import * as messageDelete from './form/handlers/message/delete';

import type { SlashCommand } from './_loader';

const formService = new FormService();
const proxyService = new ProxyService();

export const command: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('form')
        .setDescription('Manage forms')
        .setContexts([InteractionContextType.Guild])
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a new form')
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('The name of the form')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('description')
                        .setDescription('Description of the form')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('edit')
                .setDescription('Edit an existing form')
                .addStringOption(option =>
                    option
                        .setName('form')
                        .setDescription('The name of the form to edit')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName('name')
                        .setDescription('New name for the form')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('avatar_url')
                        .setDescription('New avatar URL for the form')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a form')
                .addStringOption(option =>
                    option
                        .setName('form')
                        .setDescription('The name of the form to delete')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all forms')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set a form mode')
                .addStringOption(option =>
                    option
                        .setName('mode')
                        .setDescription('The mode to set')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('hold')
                .setDescription('Hold a form')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear form settings')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Get form status')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('send')
                .setDescription('Send a form')
                .addStringOption(option =>
                    option
                        .setName('form')
                        .setDescription('Form to send as')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName('text')
                        .setDescription('Message text')
                        .setRequired(true)
                )
                .addAttachmentOption(option =>
                    option
                        .setName('file1')
                        .setDescription('First attachment')
                )
                .addAttachmentOption(option =>
                    option
                        .setName('file2')
                        .setDescription('Second attachment')
                )
                .addAttachmentOption(option =>
                    option
                        .setName('file3')
                        .setDescription('Third attachment')
                )
        )
        .addSubcommandGroup(group =>
            group
                .setName('alias')
                .setDescription('Manage form aliases')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('add')
                        .setDescription('Add an alias to a form')
                        .addStringOption(option =>
                            option
                                .setName('form_name')
                                .setDescription('The name of the form')
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option
                                .setName('alias')
                                .setDescription('The alias to add')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('list')
                        .setDescription('List aliases for a form')
                        .addStringOption(option =>
                            option
                                .setName('form_name')
                                .setDescription('The name of the form')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('Remove an alias from a form')
                        .addStringOption(option =>
                            option
                                .setName('form_name')
                                .setDescription('The name of the form')
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option
                                .setName('alias')
                                .setDescription('The alias to remove')
                                .setRequired(true)
                        )
                )
        )
        .addSubcommandGroup(group =>
            group
                .setName('message')
                .setDescription('Manage form messages')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('delete')
                        .setDescription('Delete a form message')
                        .addStringOption(option =>
                            option
                                .setName('message_id')
                                .setDescription('The ID of the message to delete')
                                .setRequired(true)
                        )
                )
        ),
    execute: async (interaction) => {
        const subcommandGroup = interaction.options.getSubcommandGroup(false);
        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommandGroup === 'alias') {
                if (subcommand === 'add') {
                    await aliasAdd.execute(interaction, formService, proxyService);
                } else if (subcommand === 'list') {
                    await aliasList.execute(interaction, formService, proxyService);
                } else if (subcommand === 'remove') {
                    await aliasRemove.execute(interaction, formService, proxyService);
                }
            } else if (subcommandGroup === 'message') {
                if (subcommand === 'delete') {
                    await messageDelete.execute(interaction, formService, proxyService);
                }
            } else {
                if (subcommand === 'add') {
                    await manage.add(interaction, formService, proxyService);
                } else if (subcommand === 'edit') {
                    await manage.edit(interaction, formService, proxyService);
                } else if (subcommand === 'delete') {
                    await manage.deleteForm(interaction, formService, proxyService);
                } else if (subcommand === 'list') {
                    await manage.list(interaction, formService, proxyService);
                } else if (subcommand === 'set') {
                    await modes.set(interaction, formService, proxyService);
                } else if (subcommand === 'hold') {
                    await modes.hold(interaction, formService, proxyService);
                } else if (subcommand === 'clear') {
                    await modes.clear(interaction, formService, proxyService);
                } else if (subcommand === 'status') {
                    await modes.status(interaction, formService, proxyService);
                } else if (subcommand === 'send') {
                    await sendHandler.execute(interaction, formService, proxyService);
                } else {
                    await interaction.reply({ content: 'Unknown subcommand.', flags: MessageFlags.Ephemeral });
                }
            }
        } catch (error) {
            await interaction.reply({ content: 'An error occurred. Please try again later.', flags: MessageFlags.Ephemeral });
        }
    },
};