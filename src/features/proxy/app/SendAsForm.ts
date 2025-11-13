import { ChannelProxyPort, SendMessageData, ProxyAttachment } from '../../../shared/ports/ChannelProxyPort';
import { DEFAULT_ALLOWED_MENTIONS } from '../../../shared/utils/allowedMentions';
import { log } from '../../../shared/utils/logger';

export interface Form {
    id: string;
    userId: string;
    name: string;
    avatarUrl?: string | null;
    createdAt: Date;
}

export interface ChannelContext {
    guildId: string;
    channelId: string;
}

export interface SendAsFormInput {
    userId: string;
    form: Form;
    text: string;
    attachments?: ProxyAttachment[]; // Reuploaded attachments in standardized format
    channelContext: ChannelContext;
}

export interface SendAsFormResult {
    webhookId: string;
    webhookToken: string;
    messageId: string;
}

/**
 * Send a message as a specific form using the channel proxy port
 * This is a Discord-agnostic use-case that handles the business logic
 * of sending proxied messages through webhooks.
 */
export async function sendAsForm(
    input: SendAsFormInput,
    channelProxy: ChannelProxyPort
): Promise<SendAsFormResult> {
    const { userId, form, text, attachments, channelContext } = input;

    try {
        log.info('Sending message as form', {
            component: 'proxy',
            userId,
            formId: form.id,
            guildId: channelContext.guildId,
            channelId: channelContext.channelId,
            status: 'send_start'
        });

        const sendData: SendMessageData = {
            username: form.name,
            content: text,
            allowedMentions: DEFAULT_ALLOWED_MENTIONS,
        };

        if (form.avatarUrl) {
            sendData.avatarUrl = form.avatarUrl;
        }

        if (attachments) {
            sendData.attachments = attachments;
        }

        const result = await channelProxy.send(sendData);

        log.info('Message sent successfully as form', {
            component: 'proxy',
            userId,
            formId: form.id,
            guildId: channelContext.guildId,
            channelId: channelContext.channelId,
            messageId: result.messageId,
            status: 'send_success'
        });

        return result;
    } catch (error) {
        log.error('Failed to send message as form', {
            component: 'proxy',
            userId,
            formId: form.id,
            guildId: channelContext.guildId,
            channelId: channelContext.channelId,
            status: 'send_error',
            error
        });
        throw error;
    }
}