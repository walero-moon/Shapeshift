import { APIAllowedMentions, AllowedMentionsTypes } from 'discord.js';

/**
 * Builds sanitized allowed_mentions structure based on permissions.
 * Avoids @everyone/@here/roles when Mention Everyone permission is lacking.
 * Includes only explicit user/role IDs from source mentions.
 *
 * @param hasMentionEveryone - Whether the actor has Mention Everyone permission
 * @param sourceMentions - Optional source mentions object with users/roles arrays
 * @returns Sanitized AllowedMentions object
 */
export function buildAllowedMentions(
    hasMentionEveryone: boolean,
    sourceMentions?: { users?: string[]; roles?: string[] }
): APIAllowedMentions {
    const allowedMentions: APIAllowedMentions = {};

    if (hasMentionEveryone) {
        allowedMentions.parse = [AllowedMentionsTypes.User, AllowedMentionsTypes.Role, AllowedMentionsTypes.Everyone];
    } else {
        allowedMentions.parse = [AllowedMentionsTypes.User, AllowedMentionsTypes.Role];
        if (sourceMentions?.users) {
            allowedMentions.users = sourceMentions.users;
        }
        if (sourceMentions?.roles) {
            allowedMentions.roles = sourceMentions.roles;
        }
    }

    return allowedMentions;
}