import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';

import { logger } from '../../../utils/logger';
import { FormService } from '../../services/FormService';
import { ProxyService } from '../../services/ProxyService';

export async function add(
    interaction: ChatInputCommandInteraction,
    formService: FormService,
    _proxyService: ProxyService,
): Promise<void> {
    const name = interaction.options.getString('name')?.trim();
    const avatarUrl = interaction.options.getString('avatar_url') || undefined;
    const userId = interaction.user.id;

    try {
        await formService.addForm(userId, name!, avatarUrl);

        // Automatically create two prefix aliases if available: <name>: and <first-letter>: (skip short if it collides)
        const aliases: string[] = [];
        if (name) {
            aliases.push(`${name}:`);
            const firstLetter = name.charAt(0).toLowerCase();
            if (firstLetter !== name.toLowerCase()) { // Skip if first letter collides with full name
                aliases.push(`${firstLetter}:`);
            }
        }

        // Since alias functionality isn't fully implemented yet, create a placeholder that logs the intended aliases but doesn't actually create them
        logger.info(`Intended aliases for form "${name}": ${aliases.join(', ')}`);

        await interaction.reply({ content: 'Form added successfully!', flags: MessageFlags.Ephemeral });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage === 'Owner does not have a system') {
            await interaction.reply({ content: 'You don\'t have a system yet. Please run `/system create` to create one.', flags: MessageFlags.Ephemeral });
        } else if (errorMessage === 'Invalid avatar URL scheme') {
            await interaction.reply({ content: 'Invalid avatar URL. Please provide a valid HTTP or HTTPS URL.', flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content: 'An error occurred while adding the form.', flags: MessageFlags.Ephemeral });
        }
    }
}

export async function edit(
    interaction: ChatInputCommandInteraction,
    formService: FormService,
    _proxyService: ProxyService,
): Promise<void> {
    const formName = interaction.options.getString('form')?.trim();
    const name = interaction.options.getString('name')?.trim();
    const avatarUrl = interaction.options.getString('avatar_url') || undefined;
    const userId = interaction.user.id;

    try {
        // Find form by name
        const forms = await formService.getForms(userId);
        const form = forms.find(f => f.name === formName);

        if (!form) {
            await interaction.reply({ content: 'Form not found.', flags: MessageFlags.Ephemeral });
            return;
        }

        await formService.editForm(userId, form.id, name, avatarUrl);
        await interaction.reply({ content: 'Form updated successfully!', flags: MessageFlags.Ephemeral });
    } catch {
        await interaction.reply({ content: 'An error occurred while updating the form.', flags: MessageFlags.Ephemeral });
    }
}

export async function deleteForm(
    interaction: ChatInputCommandInteraction,
    formService: FormService,
    _proxyService: ProxyService,
): Promise<void> {
    const formName = interaction.options.getString('form')?.trim();
    const userId = interaction.user.id;

    try {
        // Find form by name
        const forms = await formService.getForms(userId);
        const form = forms.find(f => f.name === formName);

        if (!form) {
            await interaction.reply({ content: 'Form not found.', flags: MessageFlags.Ephemeral });
            return;
        }

        await formService.deleteForm(userId, form.id);
        await interaction.reply({ content: 'Form deleted successfully!', flags: MessageFlags.Ephemeral });
    } catch {
        await interaction.reply({ content: 'An error occurred while deleting the form.', flags: MessageFlags.Ephemeral });
    }
}

export async function list(
    interaction: ChatInputCommandInteraction,
    formService: FormService,
    _proxyService: ProxyService,
): Promise<void> {
    const userId = interaction.user.id;

    try {
        const forms = await formService.getForms(userId);

        if (forms.length === 0) {
            await interaction.reply({ content: 'You have no forms.', flags: MessageFlags.Ephemeral });
            return;
        }

        const formList = forms.map(form => `- ${form.name}`).join('\n');
        await interaction.reply({ content: `Your forms:\n${formList}`, flags: MessageFlags.Ephemeral });
    } catch {
        await interaction.reply({ content: 'An error occurred while listing forms.', flags: MessageFlags.Ephemeral });
    }
}