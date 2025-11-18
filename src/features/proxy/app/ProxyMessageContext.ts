import { listForms } from '../../identity/app/ListForms';
import { proxyCoordinator } from './ProxyCoordinator';
import { reuploadAttachments } from '../../../shared/utils/attachments';
import { ChannelProxyPort, ProxyAttachment } from '../../../shared/ports/ChannelProxyPort';
import { Form } from '../../identity/infra/FormRepo';
import { log } from '../../../shared/utils/logger';

export interface ProxyMessageContextInput {
    userId: string;
    formId: string;
    targetMessage: {
        content: string;
        attachments: Array<{
            name?: string;
            url: string;
            id: string;
            size?: number;
        }>;
        author: {
            bot?: boolean;
            system?: boolean;
        };
    };
    channelContext: {
        guildId: string;
        channelId: string;
    };
    deleteOriginal?: boolean;
    sourceMessageId?: string;
    form?: Form;
}

export interface ProxyMessageContextResult {
    webhookId: string;
    webhookToken: string;
    messageId: string;
    originalDeleted?: boolean | undefined;
}

/**
 * Proxy a message from another user via context menu as one of the user's forms.
 * Handles validation, attachment reuploading, and optional original message deletion.
 */
export async function proxyMessageContext(
    input: ProxyMessageContextInput,
    channelProxy: ChannelProxyPort
): Promise<ProxyMessageContextResult> {
    const { userId, formId, targetMessage, channelContext, deleteOriginal } = input;
    const sourceMessageId = input.sourceMessageId;

    try {
        log.info('Starting proxy message context', {
            component: 'proxy-context',
            userId,
            formId,
            guildId: channelContext.guildId,
            channelId: channelContext.channelId,
            targetMessageId: sourceMessageId,
            hasAttachments: targetMessage.attachments.length > 0,
            deleteOriginal,
            status: 'proxy_context_start'
        });

        // Validate target message
        if (targetMessage.author.bot || targetMessage.author.system) {
            throw new Error('Cannot proxy bot or system messages.');
        }

        // Get user's forms and validate ownership
        let resolvedForm: Form | undefined = input.form;
        if (!resolvedForm) {
            const forms = await listForms(userId);
            const match = forms.find(f => f.id === formId);
            if (match) {
                resolvedForm = {
                    id: match.id,
                    name: match.name,
                    avatarUrl: match.avatarUrl ?? null,
                    createdAt: match.createdAt,
                    userId
                };
            }
        }

        if (!resolvedForm) {
            throw new Error('You do not own this form or it does not exist.');
        }

        // Reupload attachments if present
        let reuploadedAttachments: ProxyAttachment[] | undefined;
        if (targetMessage.attachments.length > 0) {
            log.debug('Reuploading attachments for proxy context', {
                component: 'proxy-context',
                userId,
                formId,
                attachmentCount: targetMessage.attachments.length,
                status: 'attachment_reupload_start'
            });

            const reuploaded = await reuploadAttachments(targetMessage.attachments);
            reuploadedAttachments = reuploaded.map(att => ({
                name: att.name,
                data: att.data
            }));

            log.debug('Attachments reuploaded successfully', {
                component: 'proxy-context',
                userId,
                formId,
                reuploadedCount: reuploadedAttachments.length,
                status: 'attachment_reupload_success'
            });
        }

        // Proxy the message using existing coordinator
        const proxyResult = await proxyCoordinator(
            userId,
            formId,
            channelContext.channelId,
            channelContext.guildId,
            targetMessage.content,
            channelProxy,
            reuploadedAttachments,
            undefined, // no reply
            resolvedForm,
            undefined,
            sourceMessageId,
            { recordLatch: true }
        );

        log.info('Proxy message context successful', {
            component: 'proxy-context',
            userId,
            formId,
            guildId: channelContext.guildId,
            channelId: channelContext.channelId,
            messageId: proxyResult.messageId,
            deleteOriginal,
            status: 'proxy_context_success'
        });

        const response: ProxyMessageContextResult = {
            webhookId: proxyResult.webhookId,
            webhookToken: proxyResult.token,
            messageId: proxyResult.messageId
        };

        if (typeof deleteOriginal !== 'undefined') {
            response.originalDeleted = deleteOriginal;
        }

        return response;
    } catch (error) {
        log.error('Proxy message context failed', {
            component: 'proxy-context',
            userId,
            formId,
            guildId: channelContext.guildId,
            channelId: channelContext.channelId,
            error: error instanceof Error ? error.message : String(error),
            status: 'proxy_context_error'
        });
        throw error;
    }
}
