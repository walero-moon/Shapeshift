import {
    SlashCommandSubcommandBuilder,
    ChatInputCommandInteraction,
    ButtonInteraction,
    EmbedBuilder,
    MessageFlags
} from 'discord.js';
import { listAliases } from '../app/ListAliases';
import { DEFAULT_ALLOWED_MENTIONS } from '../../../shared/utils/allowedMentions';
import { createPaginationComponents, parsePageFromCustomId, calculatePagination } from '../../../shared/utils/pagination';
import { handleInteractionError } from '../../../shared/utils/errorHandling';
import log from '../../../shared/utils/logger';

const ALIASES_PER_PAGE = 5;

export const data = new SlashCommandSubcommandBuilder()
    .setName('list')
    .setDescription('List aliases for a form')
    .addStringOption(option =>
        option.setName('form')
            .setDescription('The form to list aliases for')
            .setRequired(true)
            .setAutocomplete(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const formId = interaction.options.getString('form', true);

    try {
        const result = await listAliases(formId, interaction.user.id);

        if (result.aliases.length === 0) {
            await interaction.editReply({
                content: `No aliases found for form "${result.form.name}". Add one with \`/alias add\`.`,
                allowedMentions: DEFAULT_ALLOWED_MENTIONS
            });
            return;
        }

        const { totalPages, currentPage } = calculatePagination(result.aliases.length, ALIASES_PER_PAGE);
        const embed = buildAliasesEmbed(result, currentPage, totalPages);
        const components = createPaginationComponents({
            currentPage,
            totalPages,
            customIdPrefix: 'alias_list'
        });

        await interaction.editReply({
            embeds: [embed],
            components,
            allowedMentions: DEFAULT_ALLOWED_MENTIONS
        });
    } catch (error) {
        await handleInteractionError(interaction, error, {
            component: 'identity',
            userId: interaction.user.id,
            guildId: interaction.guild?.id || undefined,
            channelId: interaction.channel?.id || undefined,
            interactionId: interaction.id
        });
    }
}

export async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    const page = parsePageFromCustomId(interaction.customId);
    if (page === null) return;

    // Extract formId from the message embed (assuming it's stored in the footer or description)
    const embed = interaction.message.embeds[0];
    if (!embed) return;

    // Parse formId from embed title or description
    const titleMatch = embed.title?.match(/Aliases for (.+) \((.+)\)/);
    if (!titleMatch || !titleMatch[2]) return;
    const formId = titleMatch[2];

    try {
        const result = await listAliases(formId, interaction.user.id);
        const { totalPages } = calculatePagination(result.aliases.length, ALIASES_PER_PAGE);

        if (page < 1 || page > totalPages) return;

        const embed = buildAliasesEmbed(result, page, totalPages);
        const components = createPaginationComponents({
            currentPage: page,
            totalPages,
            customIdPrefix: 'alias_list'
        });

        await interaction.update({
            embeds: [embed],
            components
        });
    } catch (error) {
        // For button interactions, handle errors manually since handleInteractionError expects deferred interactions
        log.error('Error handling alias list pagination', {
            component: 'identity',
            userId: interaction.user.id,
            guildId: interaction.guild?.id,
            channelId: interaction.channel?.id,
            interactionId: interaction.id,
            error: error instanceof Error ? error.message : String(error),
            status: 'error'
        });
        const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
        await interaction.update({
            content: `Failed to update page: ${errorMessage}`,
            embeds: [],
            components: [],
            allowedMentions: DEFAULT_ALLOWED_MENTIONS
        });
    }
}

function buildAliasesEmbed(result: Awaited<ReturnType<typeof listAliases>>, page: number, totalPages: number): EmbedBuilder {
    const startIndex = (page - 1) * ALIASES_PER_PAGE;
    const endIndex = Math.min(startIndex + ALIASES_PER_PAGE, result.aliases.length);
    const pageAliases = result.aliases.slice(startIndex, endIndex);

    const embed = new EmbedBuilder()
        .setTitle(`Aliases for ${result.form.name} (${result.form.id})`)
        .setColor(0x0099ff)
        .setFooter({ text: `Page ${page} of ${totalPages}` });

    let description = '';

    for (const alias of pageAliases) {
        description += `**ID:** \`${alias.id}\`\n`;
        description += `**Trigger:** \`${alias.triggerRaw}\`\n\n`;
    }

    description += '*Use `/alias remove <id>` to remove an alias.*';

    embed.setDescription(description.trim());

    return embed;
}