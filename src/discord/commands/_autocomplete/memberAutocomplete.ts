import { AutocompleteInteraction } from 'discord.js';

import { MemberService } from '../../services/MemberService';

const memberService = new MemberService();

/**
 * Provides autocomplete functionality for member selection in slash commands.
 * Queries the user's members from their system and returns them as autocomplete choices.
 */
export const memberAutocomplete = async (interaction: AutocompleteInteraction) => {
    const focusedValue = interaction.options.getFocused(true);
    const userId = interaction.user.id;

    try {
        const members = await memberService.getMembers(userId);

        const filtered = members
            .filter(member =>
                member.name.toLowerCase().includes(focusedValue.value.toLowerCase())
            )
            .slice(0, 25) // Discord limits to 25 choices
            .map(member => ({
                name: member.name,
                value: member.id.toString(),
            }));

        await interaction.respond(filtered);
    } catch (error) {
        // If there's an error, return empty choices
        await interaction.respond([]);
    }
};