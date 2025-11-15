import {
    SlashCommandSubcommandBuilder,
    ChatInputCommandInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ModalSubmitInteraction,
    MessageFlags
} from 'discord.js';
import { editForm } from '../app/EditForm';
import { listForms } from '../app/ListForms';
import { DEFAULT_ALLOWED_MENTIONS } from '../../../shared/utils/allowedMentions';
import { handleInteractionError, validateUrl } from '../../../shared/utils/errorHandling';

export const data = new SlashCommandSubcommandBuilder()
    .setName('edit')
    .setDescription('Edit an existing form')
    .addStringOption(option =>
        option.setName('form')
            .setDescription('The form to edit')
            .setRequired(true)
            .setAutocomplete(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const formId = interaction.options.getString('form', true);

    // Get the form to prefill the modal
    const forms = await listForms(interaction.user.id);
    const form = forms.find(f => f.id === formId);

    if (!form) {
        throw new Error('Form not found');
    }

    const modal = new ModalBuilder()
        .setCustomId(`edit_form:${formId}`)
        .setTitle('Edit Form');

    const nameInput = new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Form Name')
        .setStyle(TextInputStyle.Short)
        .setValue(form.name)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(100);

    const avatarInput = new TextInputBuilder()
        .setCustomId('avatar_url')
        .setLabel('Avatar URL (optional)')
        .setStyle(TextInputStyle.Short)
        .setValue(form.avatarUrl || '')
        .setRequired(false)
        .setMinLength(0)
        .setMaxLength(500);

    const nameRow = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
    const avatarRow = new ActionRowBuilder<TextInputBuilder>().addComponents(avatarInput);

    modal.addComponents(nameRow, avatarRow);

    await interaction.showModal(modal);
}

export async function handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    const [action, formId] = interaction.customId.split(':');
    if (action !== 'edit_form' || !formId) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const newName = interaction.fields.getTextInputValue('name').trim();
        const newAvatarUrl = interaction.fields.getTextInputValue('avatar_url').trim() || null;

        // Validate name
        if (!newName) {
            throw new Error('Form name cannot be empty. Please provide a name for your form.');
        }

        // Validate avatar URL if provided
        if (newAvatarUrl) {
            const validation = validateUrl(newAvatarUrl, {
                component: 'identity',
                userId: interaction.user.id,
                guildId: interaction.guild?.id,
                channelId: interaction.channel?.id,
                interactionId: interaction.id
            });
            if (!validation.isValid) {
                throw new Error(validation.errorMessage || 'Invalid avatar URL.');
            }
        }

        // Get old form for comparison
        const forms = await listForms(interaction.user.id);
        const oldForm = forms.find(f => f.id === formId);
        if (!oldForm) {
            throw new Error('Form not found.');
        }

        const updatedForm = await editForm(formId, interaction.user.id, {
            name: newName,
            avatarUrl: newAvatarUrl
        });

        let message = `✅ Form updated successfully!\n\n**Changes:**`;

        if (oldForm.name !== updatedForm.name) {
            message += `\n• Name: "${oldForm.name}" → "${updatedForm.name}"`;
        }

        if (oldForm.avatarUrl !== updatedForm.avatarUrl) {
            const oldAvatar = oldForm.avatarUrl ? `"${oldForm.avatarUrl}"` : 'None';
            const newAvatar = updatedForm.avatarUrl ? `"${updatedForm.avatarUrl}"` : 'None';
            message += `\n• Avatar: ${oldAvatar} → ${newAvatar}`;
        }

        if (oldForm.name === updatedForm.name && oldForm.avatarUrl === updatedForm.avatarUrl) {
            message += '\n• No changes made.';
        }

        await interaction.editReply({
            content: message,
            allowedMentions: DEFAULT_ALLOWED_MENTIONS
        });
    } catch (error) {
        await handleInteractionError(interaction, error, {
            component: 'identity',
            userId: interaction.user.id,
            guildId: interaction.guild?.id,
            channelId: interaction.channel?.id,
            interactionId: interaction.id
        }, error instanceof Error ? error.message : 'An error occurred during form editing.');
    }
}