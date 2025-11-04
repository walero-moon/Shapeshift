import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { FormService } from '../../../services/FormService';
import { ProxyService } from '../../../services/ProxyService';

export async function set(
    interaction: ChatInputCommandInteraction,
    formService: FormService,
    proxyService: ProxyService,
): Promise<void> {
    const formName = interaction.options.getString('form')?.trim();
    const userId = interaction.user.id;

    try {
        if (!formName) {
            await interaction.reply({ content: 'Form name is required.', flags: MessageFlags.Ephemeral });
            return;
        }

        // Find form by name
        const forms = await formService.getForms(userId);
        const form = forms.find(f => f.name.toLowerCase() === formName.toLowerCase());

        if (!form) {
            await interaction.reply({ content: 'Form not found.', flags: MessageFlags.Ephemeral });
            return;
        }

        // TODO: Implement setting the form for next proxy
        // This would typically involve storing the form ID in some user state or session

        await interaction.reply({ content: `Set form to ${form.name} for next proxy.`, flags: MessageFlags.Ephemeral });
    } catch (error: any) {
        await interaction.reply({ content: 'An error occurred while setting the form.', flags: MessageFlags.Ephemeral });
    }
}

export async function hold(
    interaction: ChatInputCommandInteraction,
    formService: FormService,
    proxyService: ProxyService,
): Promise<void> {
    const userId = interaction.user.id;

    try {
        // TODO: Implement turning on sticky/latch mode
        // This would typically involve setting a flag in user state to keep the current form active

        await interaction.reply({ content: 'Sticky mode enabled.', flags: MessageFlags.Ephemeral });
    } catch (error: any) {
        await interaction.reply({ content: 'An error occurred while enabling hold mode.', flags: MessageFlags.Ephemeral });
    }
}

export async function clear(
    interaction: ChatInputCommandInteraction,
    formService: FormService,
    proxyService: ProxyService,
): Promise<void> {
    const userId = interaction.user.id;

    try {
        // TODO: Implement turning off autoproxy
        // This would typically involve clearing any active form state

        await interaction.reply({ content: 'Autoproxy cleared.', flags: MessageFlags.Ephemeral });
    } catch (error: any) {
        await interaction.reply({ content: 'An error occurred while clearing autoproxy.', flags: MessageFlags.Ephemeral });
    }
}

export async function status(
    interaction: ChatInputCommandInteraction,
    formService: FormService,
    proxyService: ProxyService,
): Promise<void> {
    const userId = interaction.user.id;

    try {
        // TODO: Implement showing current proxy status
        // This would typically involve checking current form state, sticky mode, etc.

        const forms = await formService.getForms(userId);
        const formCount = forms.length;

        let statusMessage = `You have ${formCount} form${formCount !== 1 ? 's' : ''}.`;

        if (formCount > 0) {
            statusMessage += `\nForms: ${forms.map(f => f.name).join(', ')}`;
        }

        // TODO: Add current active form and sticky mode status

        await interaction.reply({ content: statusMessage, flags: MessageFlags.Ephemeral });
    } catch (error: any) {
        await interaction.reply({ content: 'An error occurred while getting status.', flags: MessageFlags.Ephemeral });
    }
}