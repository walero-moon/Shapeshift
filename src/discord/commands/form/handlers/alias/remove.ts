import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';

import { FormService } from '../../../services/FormService';
import { ProxyService } from '../../../services/ProxyService';

export const execute = async (
    interaction: ChatInputCommandInteraction,
    formService: FormService,
    proxyService: ProxyService,
): Promise<void> => {
    const formName = interaction.options.getString('form');

    if (!formName) {
        await interaction.reply({ content: 'Form name is required.', flags: MessageFlags.Ephemeral });
        return;
    }

    try {
        // Find form by name
        const forms = await formService.getForms(interaction.user.id);
        const form = forms.find(f => f.name === formName);

        if (!form) {
            await interaction.reply({ content: 'Form not found.', flags: MessageFlags.Ephemeral });
            return;
        }

        // Placeholder: Alias removal UI not yet implemented
        await interaction.reply({ content: 'Alias removal UI will be implemented in a later PR.', flags: MessageFlags.Ephemeral });
    } catch (error: any) {
        await interaction.reply({ content: 'An error occurred while processing the alias removal. Please try again later.', flags: MessageFlags.Ephemeral });
    }
};