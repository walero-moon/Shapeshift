import { formRepo } from '../../identity/infra/FormRepo';
import { buildProxyMessage } from './BuildProxyMessage';
import { ChannelProxyPort, SendMessageData } from '../../../shared/ports/ChannelProxyPort';
import { proxiedMessageRepo } from '../infra/ProxiedMessageRepo';
import { generateUuidv7OrUndefined } from '../../../shared/db/uuidDetection';
import { log } from '../../../shared/utils/logger';
import { Attachment } from 'discord.js';

/**
 * Orchestrates the proxying process: fetch form, build payload, send via port, persist proxied message.
 * Assumes permissions are validated externally. Throws on send failure or database errors.
 * Discord-agnostic use-case.
 */
export async function proxyCoordinator(
    userId: string,
    formId: string,
    channelId: string,
    guildId: string,
    body: string,
    channelProxy: ChannelProxyPort,
    attachments?: Attachment[],
    _replyTo?: { guildId: string; channelId: string; messageId: string }
): Promise<{ webhookId: string; token: string; messageId: string }> {
    try {
        log.info('Starting proxy coordination', {
            component: 'proxy',
            userId,
            formId,
            guildId,
            channelId,
            status: 'proxy_start'
        });

        // Fetch form
        const form = await formRepo.getById(formId);
        if (!form) {
            throw new Error(`Form with ID ${formId} not found`);
        }

        // Build proxy message payload
        const payload = buildProxyMessage(form, body, attachments);

        // Send via channel proxy
        const sendData: SendMessageData = {
            username: payload.username,
            content: payload.content,
            allowedMentions: payload.allowed_mentions
        };

        if (payload.avatar_url) {
            sendData.avatarUrl = payload.avatar_url;
        }

        if (payload.attachments) {
            sendData.attachments = payload.attachments;
        }

        log.debug('Sending message via channel proxy', {
            component: 'proxy',
            userId,
            formId,
            guildId,
            channelId,
            hasReplyTo: !!_replyTo,
            replyTo: _replyTo,
            status: 'sending_via_proxy'
        });

        const sendResult = await channelProxy.send(sendData, _replyTo);

        // Persist proxied message
        const proxiedMessageId = await generateUuidv7OrUndefined();
        await proxiedMessageRepo.insert({
            id: proxiedMessageId || '', // Fallback if no UUID generation
            userId,
            formId,
            guildId,
            channelId,
            webhookId: sendResult.webhookId,
            webhookToken: sendResult.webhookToken,
            messageId: sendResult.messageId
        });

        log.info('Proxy coordination successful', {
            component: 'proxy',
            userId,
            formId,
            guildId,
            channelId,
            messageId: sendResult.messageId,
            status: 'proxy_success'
        });

        return {
            webhookId: sendResult.webhookId,
            token: sendResult.webhookToken,
            messageId: sendResult.messageId
        };
    } catch (error) {
        log.error('Proxy coordination failed', {
            component: 'proxy',
            userId,
            formId,
            guildId,
            channelId,
            status: 'proxy_error',
            error
        });
        throw error;
    }
}