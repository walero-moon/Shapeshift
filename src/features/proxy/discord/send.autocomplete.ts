import { AutocompleteInteraction } from 'discord.js';
import { listForms } from '../../identity/app/ListForms';
import { log } from '../../../shared/utils/logger';

export async function execute(interaction: AutocompleteInteraction) {
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name !== 'form') {
        return interaction.respond([]);
    }

    try {
        const forms = await listForms(interaction.user.id);
        const partialName = focusedOption.value.toLowerCase();

        const filtered = forms
            .filter(form => form.name.toLowerCase().includes(partialName))
            .slice(0, 25)
            .map(form => ({
                name: form.name,
                value: form.id
            }));

        return interaction.respond(filtered);
    } catch (error) {
        // For autocomplete, we can't use handleInteractionError as it expects reply/editReply methods
        // Instead, log the error and respond with empty array
        log.error('Error in send form autocomplete', {
            component: 'proxy',
            userId: interaction.user.id,
            guildId: interaction.guild?.id,
            error: error instanceof Error ? error.message : String(error),
            status: 'error'
        });
        return interaction.respond([]);
    }
}