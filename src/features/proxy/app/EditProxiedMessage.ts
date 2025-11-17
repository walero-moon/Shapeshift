import { ChannelProxyPort, ProxyAttachment } from '../../../shared/ports/ChannelProxyPort';
import { DEFAULT_ALLOWED_MENTIONS } from '../../../shared/utils/allowedMentions';
import { reuploadAttachments } from '../../../shared/utils/attachments';
import { log } from '../../../shared/utils/logger';
import { ProxiedMessage } from '../infra/ProxiedMessageRepo';

interface AttachmentInput {
    name?: string;
    url: string;
    id: string;
    size?: number;
}

export interface EditProxiedMessageInput {
    record: ProxiedMessage;
    userId: string;
    content: string;
    attachments?: AttachmentInput[];
}

/**
 * Updates an existing proxied message by editing the backing webhook message.
 * Validates ownership, re-uploads attachments when necessary, and enforces allowed mentions.
 */
export async function editProxiedMessage(
    input: EditProxiedMessageInput,
    channelProxy: ChannelProxyPort
): Promise<void> {
    const { record, userId, content } = input;

    log.info('Starting proxied message edit', {
        component: 'proxy-context',
        userId,
        formId: record.formId,
        channelId: record.channelId,
        guildId: record.guildId,
        messageId: record.messageId,
        status: 'edit_start'
    });

    if (record.userId !== userId) {
        throw new Error('You can only edit messages you proxied.');
    }

    let attachmentPayload: ProxyAttachment[] | undefined;
    if (input.attachments && input.attachments.length > 0) {
        const reuploaded = await reuploadAttachments(input.attachments);
        if (reuploaded.length > 0) {
            attachmentPayload = reuploaded.map(att => ({
                name: att.name,
                data: att.data
            }));
        }
    }

    const editPayload = {
        content,
        allowedMentions: DEFAULT_ALLOWED_MENTIONS,
        ...(attachmentPayload ? { attachments: attachmentPayload } : {})
    };

    await channelProxy.edit(record.webhookId, record.webhookToken, record.messageId, editPayload);

    log.info('Proxied message edit complete', {
        component: 'proxy-context',
        userId,
        formId: record.formId,
        channelId: record.channelId,
        guildId: record.guildId,
        messageId: record.messageId,
        attachmentCount: attachmentPayload?.length ?? 0,
        status: 'edit_success'
    });
}
