import { AutocompleteInteraction } from 'discord.js';

import { FormService } from '../../services/FormService';

const formService = new FormService();

/**
 * Provides autocomplete functionality for form selection in slash commands.
 * Queries the user's forms from their system and returns them as autocomplete choices.
 */
export const formAutocomplete = async (interaction: AutocompleteInteraction) => {
    const focusedValue = interaction.options.getFocused(true);
    const userId = interaction.user.id;

    try {
        const forms = await formService.getForms(userId);

        const filtered = forms
            .filter(form =>
                form.name.toLowerCase().includes(focusedValue.value.toLowerCase())
            )
            .slice(0, 25) // Discord limits to 25 choices
            .map(form => ({
                name: form.name,
                value: form.id.toString(),
            }));

        await interaction.respond(filtered);
    } catch (error) {
        // If there's an error, return empty choices
        await interaction.respond([]);
    }
};