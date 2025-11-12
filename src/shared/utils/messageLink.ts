export function buildMessageUrl(message: { url?: string; guildId: string; channelId: string; messageId: string }): string {
    if (message.url) {
        return message.url;
    }
    return `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.messageId}`;
}