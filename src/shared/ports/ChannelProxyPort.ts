import { MessageMentionOptions, Attachment } from 'discord.js';

export interface SendMessageData {
    username: string;
    avatarUrl?: string;
    content: string;
    attachments?: Attachment[];
    allowedMentions: MessageMentionOptions;
}

export interface EditMessageData {
    content: string;
    attachments?: Attachment[];
    allowedMentions: MessageMentionOptions;
}

export interface ChannelProxyPort {
    send(data: SendMessageData): Promise<{ webhookId: string; webhookToken: string; messageId: string }>;
    edit(webhookId: string, webhookToken: string, messageId: string, data: EditMessageData): Promise<void>;
    delete(webhookId: string, webhookToken: string, messageId: string): Promise<void>;
}