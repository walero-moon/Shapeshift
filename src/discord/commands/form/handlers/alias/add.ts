import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';

import { FormService } from '../../../services/FormService';
import { ProxyService } from '../../../services/ProxyService';

export const execute = async (
    interaction: ChatInputCommandInteraction,
    formService: FormService,
    proxyService: ProxyService,
): Promise<void> => {
    const formName = interaction.options.getString('form_name');
    const alias = interaction.options.getString('alias');

    if (!formName || !alias) {
        await interaction.reply({ content: 'Form name and alias are required.', flags: MessageFlags.Ephemeral });
        return;
    }

    // Validate alias format: must include literal text like n:text or {text}
    const isValidFormat = alias.includes(':') || (alias.startsWith('{') && alias.endsWith('}'));
    if (!isValidFormat) {
        await interaction.reply({ content: 'Invalid alias format. Must be like "n:text" or "{text}".', flags: MessageFlags.Ephemeral });
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

        // Placeholder: Alias functionality not yet implemented
        await interaction.reply({ content: 'Alias functionality not yet implemented. Command acknowledged.', flags: MessageFlags.Ephemeral });
    } catch (error: any) {
        await interaction.reply({ content: 'An error occurred while processing the alias. Please try again later.', flags: MessageFlags.Ephemeral });
    }
};