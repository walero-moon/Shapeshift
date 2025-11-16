import { TextChannel, Attachment, PermissionsBitField, GuildMember } from 'discord.js';

export async function validateUserChannelPerms(
    userId: string,
    channel: TextChannel,
    attachments?: Attachment[],
    member?: GuildMember
): Promise<boolean> {
    try {
        const resolvedMember = member || await channel.guild.members.fetch(userId);
        const perms = resolvedMember.permissionsIn(channel);

        if (!perms.has(PermissionsBitField.Flags.ViewChannel)) return false;
        if (!perms.has(PermissionsBitField.Flags.SendMessages)) return false;
        if (attachments && attachments.length > 0 && !perms.has(PermissionsBitField.Flags.AttachFiles)) return false;


        return true;
    } catch {
        // If unable to fetch member or any error, assume insufficient permissions
        return false;
    }
}