import type { Readable } from 'stream';
import type { Message } from 'discord.js';

// Discord-agnostic attachment format
export interface ProxyAttachment {
    name: string;
    data: Buffer | Readable;
}

export interface AllowedMentions {
    parse?: ('users' | 'roles' | 'everyone')[];
    repliedUser?: boolean;
}

export interface SendMessageData {
    username: string;
    avatarUrl?: string;
    content: string;
    attachments?: ProxyAttachment[];
    allowedMentions: AllowedMentions;
}

export interface EditMessageData {
    content: string;
    attachments?: ProxyAttachment[];
    allowedMentions: AllowedMentions;
}

export interface ChannelProxyPort {
    send(data: SendMessageData, replyTo?: { guildId: string; channelId: string; messageId: string } | null, replyMessage?: Message | null): Promise<{ webhookId: string; webhookToken: string; messageId: string }>;
    edit(webhookId: string, webhookToken: string, messageId: string, data: EditMessageData): Promise<void>;
    delete(webhookId: string, webhookToken: string, messageId: string): Promise<void>;
}