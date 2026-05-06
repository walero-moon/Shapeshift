import { SlashCommandBuilder, ChatInputCommandInteraction, ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, Message, StringSelectMenuBuilder, StringSelectMenuInteraction, Client } from 'discord.js';
import { setAutoproxyState } from '../app/autoproxy/SetAutoproxyState';
import { clearAutoproxyState } from '../app/autoproxy/ClearAutoproxyState';
import { autoproxyRepo, type AutoproxyState } from '../infra/AutoproxyRepo';
import { formRepo } from '../../identity/infra/FormRepo';
import { handleInteractionError } from '../../../shared/utils/errorHandling';
import { DEFAULT_ALLOWED_MENTIONS } from '../../../shared/utils/allowedMentions';
import { log } from '../../../shared/utils/logger';
import { listForms } from '../../identity/app/ListForms';

export const command = {
    data: new SlashCommandBuilder()
        .setName('shapeshift')
        .setDescription('Manage autoproxy settings')
        .addSubcommand(sub =>
            sub
                .setName('form')
                .setDescription('Set autoproxy to a specific form')
                .addStringOption(option =>
                    option
                        .setName('form')
                        .setDescription('The form to proxy as')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addStringOption(option =>
                    option
                        .setName('scope')
                        .setDescription('Scope of autoproxy')
                        .addChoices(
                            { name: 'Channel', value: 'channel' },
                            { name: 'Guild', value: 'guild' },
                            { name: 'Global', value: 'global' }
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('latch')
                .setDescription('Set autoproxy to latch mode')
                .addStringOption(option =>
                    option
                        .setName('scope')
                        .setDescription('Scope of autoproxy')
                        .addChoices(
                            { name: 'Channel', value: 'channel' },
                            { name: 'Guild', value: 'guild' },
                            { name: 'Global', value: 'global' }
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('front')
                .setDescription('Set autoproxy to front mode (not available yet)')
                .addStringOption(option =>
                    option
                        .setName('scope')
                        .setDescription('Scope of autoproxy')
                        .addChoices(
                            { name: 'Channel', value: 'channel' },
                            { name: 'Guild', value: 'guild' },
                            { name: 'Global', value: 'global' }
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('clear')
                .setDescription('Clear autoproxy settings')
                .addStringOption(option =>
                    option
                        .setName('scope')
                        .setDescription('Scope to clear')
                        .addChoices(
                            { name: 'All', value: 'all' },
                            { name: 'Channel', value: 'channel' },
                            { name: 'Guild', value: 'guild' },
                            { name: 'Global', value: 'global' }
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('status')
                .setDescription('View current autoproxy settings')
                .addStringOption(option =>
                    option
                        .setName('scope')
                        .setDescription('Scope to check')
                        .addChoices(
                            { name: 'All', value: 'all' },
                            { name: 'Channel', value: 'channel' },
                            { name: 'Guild', value: 'guild' },
                            { name: 'Global', value: 'global' }
                        )
                        .setRequired(false)
                )
        ),
    execute: async (interaction: ChatInputCommandInteraction): Promise<Message<boolean> | undefined> => {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const subcommand = interaction.options.getSubcommand();
            const userId = interaction.user.id;
            const guildId = interaction.guild?.id || null;
            const channelId = interaction.channel?.id || null;

            let scope = interaction.options.getString('scope') as 'channel' | 'guild' | 'global' | 'all' | null;
            if (!scope) scope = 'guild'; // default

            // Validate scope requirements
            if (scope === 'channel' && !guildId) {
                return interaction.editReply({
                    content: 'Channel scope requires being in a server channel.',
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
            }
            if (scope === 'guild' && !guildId) {
                return interaction.editReply({
                    content: 'Guild scope requires being in a server.',
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
            }

            switch (subcommand) {
                case 'form': {
                    const formId = interaction.options.getString('form', true);
                    await setAutoproxyState({
                        userId,
                        mode: 'form',
                        formId,
                        scope: scope as 'channel' | 'guild' | 'global',
                        guildId,
                        channelId
                    });

                    const form = await formRepo.getCachedByUserAndId(userId, formId);
                    const scopeLabel = formatScopeText(scope as 'channel' | 'guild' | 'global', guildId, channelId, interaction.client);

                    await interaction.editReply({
                        content: `Autoproxy set to form "${form?.name || 'Unknown'}" for ${scopeLabel}.`,
                        allowedMentions: DEFAULT_ALLOWED_MENTIONS
                    });
                    return undefined;
                }
                case 'latch': {
                    const result = await setAutoproxyState({
                        userId,
                        mode: 'latch',
                        scope: scope as 'channel' | 'guild' | 'global',
                        guildId,
                        channelId
                    });

                    const scopeLabel = formatScopeText(scope as 'channel' | 'guild' | 'global', guildId, channelId, interaction.client);
                    const latchedFormName = result.state.lastFormId
                        ? await resolveFormName(userId, result.state.lastFormId)
                        : null;

                    const content = result.state.lastFormId
                        ? `Latch mode active for ${scopeLabel}. Currently locked on "${latchedFormName ?? 'Unknown form'}". Proxy with another form to switch.`
                        : `Latch mode armed for ${scopeLabel}. Proxy once via an alias or /send to lock on a form.`;

                    log.info(result.state.lastFormId ? 'Latch mode locked' : 'Latch mode pending', {
                        component: 'autoproxy',
                        userId,
                        guildId: guildId || undefined,
                        channelId: channelId || undefined,
                        scope,
                        latchedFormId: result.state.lastFormId || undefined,
                        status: result.state.lastFormId ? 'latch_locked' : 'latch_pending'
                    });

                    await interaction.editReply({
                        content,
                        allowedMentions: DEFAULT_ALLOWED_MENTIONS
                    });
                    return undefined;
                }
                case 'front': {
                    await interaction.editReply({
                        content: 'Front mode isn\'t available yet.',
                        allowedMentions: DEFAULT_ALLOWED_MENTIONS
                    });
                    return undefined;
                }
                case 'clear': {
                    await clearAutoproxyState({
                        userId,
                        scope: scope as 'channel' | 'guild' | 'global' | 'all',
                        guildId,
                        channelId
                    });

                    const scopeLabel = scope === 'all'
                        ? 'all scopes'
                        : formatScopeText(scope as 'channel' | 'guild' | 'global', guildId, channelId, interaction.client);

                    await interaction.editReply({
                        content: `Autoproxy cleared for ${scopeLabel}.`,
                        allowedMentions: DEFAULT_ALLOWED_MENTIONS
                    });
                    return undefined;
                }
                case 'status': {
                    const states = await autoproxyRepo.getAllStates(userId);
                    const formNameCache = new Map<string, string | null>();

                    if (states.length === 0) {
                        return interaction.editReply({
                            content: 'No autoproxy settings found.',
                            allowedMentions: DEFAULT_ALLOWED_MENTIONS
                        });
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('Autoproxy Status')
                        .setColor(0x0099ff);

                    const components: ActionRowBuilder<ButtonBuilder>[] = [];

                    for (const state of states) {
                        const scopeDisplay = buildScopeLabels(interaction.client, state.guildId ?? null, state.channelId ?? null);
                        const createdAt = new Date(state.createdAt).toLocaleString();
                        let modeLabel: string;

                        if (state.mode === 'latch') {
                            if (state.lastFormId) {
                                const lockedName = await resolveFormName(userId, state.lastFormId, formNameCache);
                                modeLabel = `Latch (locked on "${lockedName ?? 'Unknown form'}")`;
                            } else {
                                modeLabel = 'Latch (waiting for next proxy)';
                            }
                        } else {
                            const formName = await resolveFormName(userId, state.formId, formNameCache);
                            modeLabel = `Form ("${formName ?? 'Unknown form'}")`;
                        }

                        embed.addFields({
                            name: scopeDisplay.fieldLabel,
                            value: `${modeLabel} since ${createdAt}`,
                            inline: false
                        });

                        addActionButtonsForState(components, state, scopeDisplay.shortLabel);
                    }

                    await interaction.editReply({
                        embeds: [embed],
                        components,
                        allowedMentions: DEFAULT_ALLOWED_MENTIONS
                    });
                    return undefined;
                }
                default:
                    throw new Error('Unknown subcommand');
            }

        } catch (error) {
            await handleInteractionError(interaction, error, {
                component: 'autoproxy',
                userId: interaction.user.id,
                guildId: interaction.guild?.id || undefined,
                channelId: interaction.channel?.id || undefined,
                interactionId: interaction.id
            });
            return;
        }
    }
};

// Button handler
export async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.customId.startsWith('autoproxy:')) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const parts = interaction.customId.split(':');
        const action = parts[1];

        if (action === 'clear') {
            const stateId = parts[2];
            if (!stateId) {
                await interaction.editReply({
                    content: 'Invalid autoproxy action.',
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
                return;
            }
            await handleClearButton(interaction, stateId);
            return;
        }

        if (action === 'switch') {
            const stateId = parts[2];
            if (!stateId) {
                await interaction.editReply({
                    content: 'Invalid autoproxy action.',
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
                return;
            }
            await handleSwitchButton(interaction, stateId);
            return;
        }

        await interaction.editReply({
            content: 'Unsupported action.',
            allowedMentions: DEFAULT_ALLOWED_MENTIONS
        });

    } catch (error) {
        log.error('Button interaction error', {
            component: 'autoproxy',
            userId: interaction.user.id,
            guildId: interaction.guild?.id ?? undefined,
            channelId: interaction.channel?.id ?? undefined,
            interactionId: interaction.id,
            error: error instanceof Error ? error.message : String(error),
            status: 'interaction_error'
        });

        try {
            if (interaction.deferred) {
                await interaction.editReply({
                    content: 'An unexpected error occurred. Please try again later.',
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS
                });
            } else {
                await interaction.reply({
                    content: 'An unexpected error occurred. Please try again later.',
                    allowedMentions: DEFAULT_ALLOWED_MENTIONS,
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (responseError) {
            log.error('Failed to send error response to user', {
                component: 'autoproxy',
                userId: interaction.user.id,
                guildId: interaction.guild?.id ?? undefined,
                channelId: interaction.channel?.id ?? undefined,
                interactionId: interaction.id,
                error: responseError instanceof Error ? responseError.message : String(responseError),
                status: 'response_error'
            });
        }
    }
}

export async function handleSelectInteraction(interaction: StringSelectMenuInteraction): Promise<void> {
    if (!interaction.customId.startsWith('autoproxy:switch-select:')) return;

    const stateId = interaction.customId.split(':')[2];
    const selectedFormId = interaction.values[0];
    if (!stateId || !selectedFormId) {
        await interaction.update({
            content: 'Invalid autoproxy selection.',
            components: []
        });
        return;
    }

    try {
        const state = await autoproxyRepo.getStateById(stateId);
        if (!state || state.userId !== interaction.user.id) {
            await interaction.update({
                content: 'Autoproxy entry no longer exists.',
                components: []
            });
            return;
        }

        await setAutoproxyState({
            userId: interaction.user.id,
            mode: 'form',
            formId: selectedFormId,
            scope: state.channelId ? 'channel' : state.guildId ? 'guild' : 'global',
            guildId: state.guildId ?? null,
            channelId: state.channelId ?? null
        });

        const formName = await resolveFormName(interaction.user.id, selectedFormId);
        const scopeLabels = buildScopeLabels(interaction.client, state.guildId ?? null, state.channelId ?? null);

        await interaction.update({
            content: `Autoproxy switched to "${formName ?? 'Unknown'}" for ${scopeLabels.shortLabel}.`,
            components: []
        });

        log.info('Autoproxy switched via select', {
            component: 'autoproxy',
            userId: interaction.user.id,
            guildId: state.guildId ?? undefined,
            channelId: state.channelId ?? undefined,
            formId: selectedFormId,
            status: 'switch_success'
        });
    } catch (error) {
        log.error('Autoproxy switch select error', {
            component: 'autoproxy',
            userId: interaction.user.id,
            stateId,
            status: 'interaction_error',
            error: error instanceof Error ? error.message : String(error)
        });

        if (!interaction.deferred && !interaction.replied) {
            await interaction.update({
                content: 'An error occurred while switching forms.',
                components: []
            });
        } else if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
                content: 'An error occurred while switching forms.',
                components: [],
                allowedMentions: DEFAULT_ALLOWED_MENTIONS
            });
        } else {
            await interaction.reply({
                content: 'An error occurred while switching forms.',
                components: [],
                allowedMentions: DEFAULT_ALLOWED_MENTIONS,
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

type FormNameCache = Map<string, string | null>;

async function resolveFormName(userId: string, formId?: string | null, cache?: FormNameCache): Promise<string | null> {
    if (!formId) {
        return null;
    }

    if (cache?.has(formId)) {
        return cache.get(formId) ?? null;
    }

    const form = await formRepo.getCachedByUserAndId(userId, formId);
    const name = form?.name ?? null;

    if (cache) {
        cache.set(formId, name);
    }

    return name;
}

async function handleSwitchButton(interaction: ButtonInteraction, stateId: string): Promise<void> {
    const state = await autoproxyRepo.getStateById(stateId);

    if (!state || state.userId !== interaction.user.id) {
        await interaction.editReply({
            content: 'Unable to find that autoproxy entry.',
            allowedMentions: DEFAULT_ALLOWED_MENTIONS
        });
        return;
    }

    if (state.mode !== 'form') {
        await interaction.editReply({
            content: 'Switch form is only available for form-mode autoproxy entries.',
            allowedMentions: DEFAULT_ALLOWED_MENTIONS
        });
        return;
    }

    const forms = await listForms(interaction.user.id);
    if (!forms.length) {
        await interaction.editReply({
            content: 'You have no forms to switch to.',
            allowedMentions: DEFAULT_ALLOWED_MENTIONS
        });
        return;
    }

    const options = forms.slice(0, 25).map(form => ({
        label: form.name.slice(0, 100),
        value: form.id
    }));

    const select = new StringSelectMenuBuilder()
        .setCustomId(`autoproxy:switch-select:${state.id}`)
        .setPlaceholder('Choose a form')
        .addOptions(options);

    await interaction.editReply({
        content: 'Pick a new form for this autoproxy entry.',
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
        allowedMentions: DEFAULT_ALLOWED_MENTIONS
    });
}

async function handleClearButton(interaction: ButtonInteraction, stateId: string): Promise<void> {
    const state = await autoproxyRepo.getStateById(stateId);

    if (!state || state.userId !== interaction.user.id) {
        await interaction.editReply({
            content: 'Unable to find that autoproxy entry.',
            allowedMentions: DEFAULT_ALLOWED_MENTIONS
        });
        return;
    }

    const scope: 'channel' | 'guild' | 'global' = state.channelId ? 'channel' : state.guildId ? 'guild' : 'global';
    const guildId = state.guildId ?? null;
    const channelId = state.channelId ?? null;

    await clearAutoproxyState({
        userId: interaction.user.id,
        scope,
        guildId,
        channelId
    });

    const scopeDisplay = buildScopeLabels(interaction.client, guildId, channelId);

    await interaction.editReply({
        content: `Autoproxy cleared for ${scopeDisplay.shortLabel}.`,
        allowedMentions: DEFAULT_ALLOWED_MENTIONS
    });

    log.info('Autoproxy cleared via button', {
        component: 'autoproxy',
        userId: interaction.user.id,
        guildId: guildId ?? undefined,
        channelId: channelId ?? undefined,
        stateId,
        status: 'success'
    });
}

function addActionButtonsForState(rows: ActionRowBuilder<ButtonBuilder>[], state: AutoproxyState, scopeLabel: string) {
    const row = new ActionRowBuilder<ButtonBuilder>();

    const clearButton = new ButtonBuilder()
        .setCustomId(`autoproxy:clear:${state.id}`)
        .setLabel(`Clear ${scopeLabel}`)
        .setStyle(ButtonStyle.Danger);
    row.addComponents(clearButton);

    if (state.mode === 'form') {
        const switchButton = new ButtonBuilder()
            .setCustomId(`autoproxy:switch:${state.id}`)
            .setLabel(`Switch ${scopeLabel}`)
            .setStyle(ButtonStyle.Secondary);
        row.addComponents(switchButton);
    }

    rows.push(row);
}

function formatScopeText(scope: 'channel' | 'guild' | 'global', guildId: string | null, channelId: string | null, client: Client): string {
    const { guildId: normalizedGuildId, channelId: normalizedChannelId } = normalizeScopeIds(scope, guildId, channelId);
    const labels = buildScopeLabels(client, normalizedGuildId, normalizedChannelId);
    return labels.shortLabel;
}

function normalizeScopeIds(scope: 'channel' | 'guild' | 'global', guildId: string | null, channelId: string | null) {
    switch (scope) {
        case 'channel':
            return { guildId, channelId };
        case 'guild':
            return { guildId, channelId: null };
        case 'global':
        default:
            return { guildId: null, channelId: null };
    }
}

function buildScopeLabels(client: Client, guildId: string | null, channelId: string | null) {
    if (channelId) {
        const channel = client.channels.cache.get(channelId);
        const channelName = (channel && 'name' in channel) ? (channel as { name?: string }).name : undefined;
        const readable = channelName ? `channel #${channelName}` : `channel ${channelId}`;
        return {
            fieldLabel: `Channel <#${channelId}>`,
            shortLabel: readable,
        };
    }

    if (guildId) {
        const guild = client.guilds.cache.get(guildId);
        const guildName = guild?.name ?? guildId;
        return {
            fieldLabel: `Guild "${guildName}"`,
            shortLabel: `guild ${guildName}`,
        };
    }

    return {
        fieldLabel: 'Global (all servers)',
        shortLabel: 'all servers',
    };
}
