// Discord-agnostic interface matching ChannelProxyPort.ProxyAttachment
interface DiscordAttachment {
    name?: string;
    url: string;
    id: string;
}

import { Readable } from 'node:stream';
import { retryAsync } from './retry';
import { log } from './logger';

/**
 * Re-uploads Discord attachments by downloading them and returning as streams or buffers
 * for webhook use. Webhooks cannot directly use Discord attachment URLs.
 * Returns Discord-agnostic ProxyAttachment format with streaming support.
 */
export async function reuploadAttachments(attachments: DiscordAttachment[]): Promise<Array<{ name: string; data: Buffer | Readable }>> {
    if (attachments.length === 0) {
        log.debug('No attachments to reupload', {
            component: 'utils',
            stage: 'attachments',
            durationMs: 0,
            status: 'attachment_noop'
        });
        return [];
    }

    const results = await Promise.all(
        attachments.map(async (attachment) => {
            const startTime = Date.now();

            try {
                const response = await retryAsync(
                    () => fetch(attachment.url),
                    {
                        maxAttempts: 3,
                        baseDelay: 1000,
                        maxDelay: 5000,
                        backoffFactor: 2,
                        component: 'utils',
                        operation: 'attachment_reupload'
                    }
                );

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                let data: Buffer | Readable;

                // Use buffer download for webhook compatibility (streaming not supported by Discord.js webhooks)
                log.debug('Using buffer download for attachment (streaming disabled for webhook compatibility)', {
                    component: 'utils',
                    attachmentId: attachment.id,
                    status: 'attachment_buffer_download'
                });

                const arrayBuffer = await response.arrayBuffer();
                data = Buffer.from(arrayBuffer);

                log.debug('Attachment reupload completed', {
                    component: 'utils',
                    attachmentId: attachment.id,
                    dataType: 'Buffer',
                    dataLength: data.length,
                    durationMs: Date.now() - startTime,
                    status: 'attachment_reupload_success'
                });

                return {
                    name: attachment.name || `attachment_${attachment.id}`,
                    data,
                };
            } catch (error) {
                const durationMs = Date.now() - startTime;
                log.warn('Failed to reupload attachment for webhook', {
                    component: 'utils',
                    attachmentId: attachment.id,
                    attachmentUrl: attachment.url,
                    durationMs,
                    error: error instanceof Error ? error.message : String(error),
                    status: 'attachment_reupload_failed',
                });

                // Skip failed attachments rather than failing the entire operation
                return null;
            }
        })
    );

    // Filter out failed reuploads
    return results.filter((result): result is NonNullable<typeof result> => result !== null);
}