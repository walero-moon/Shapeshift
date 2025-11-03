import { GuildMember, GuildTextBasedChannel, PermissionsBitField, MessageFlags } from 'discord.js';
import { buildAllowedMentions } from '../utils/allowedMentions.js';

/**
 * PermissionGuard middleware for Discord message proxying.
 * Computes effective permissions and returns sanitized send options.
 * @param input - The input object containing member, channel, and source message data.
 * @returns Sanitized send options or null if sending is not allowed.
 */
export function permissionGuard(input: {
    member: GuildMember;
    channel: GuildTextBasedChannel;
    source: {
        content: string;
        attachments?: any[];
        mentions?: { users?: string[]; roles?: string[] };
    };
}): { allowedMentions: ReturnType<typeof buildAllowedMentions>; files?: any[]; flags?: number } | null {
    const { member, channel, source } = input;
    const permissions = member.permissionsIn(channel);

    // Check if member can send messages
    if (!permissions.has(PermissionsBitField.Flags.SendMessages)) {
        return null;
    }

    let flags = 0;
    // Suppress embeds if no embed links permission
    if (!permissions.has(PermissionsBitField.Flags.EmbedLinks)) {
        flags |= MessageFlags.SuppressEmbeds;
    }

    let files = source.attachments;
    // Drop attachments if no attach files permission
    if (!permissions.has(PermissionsBitField.Flags.AttachFiles)) {
        files = undefined;
    } else if (files && files.length === 0) {
        files = undefined;
    }

    const allowedMentions = buildAllowedMentions(
        permissions.has(PermissionsBitField.Flags.MentionEveryone),
        source.mentions
    );

    return { allowedMentions, files, flags: flags || undefined };
}