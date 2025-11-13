// Discord-agnostic interface matching ChannelProxyPort.ProxyAttachment
interface DiscordAttachment {
    name: string;
    url: string;
    id: string;
}

import { retryAsync } from './retry';
import { log } from './logger';

/**
 * Re-uploads Discord attachments by downloading them and returning as buffers
 * for webhook use. Webhooks cannot directly use Discord attachment URLs.
 * Returns Discord-agnostic ProxyAttachment format.
 */
export async function reuploadAttachments(attachments: DiscordAttachment[]): Promise<Array<{ name: string; data: Buffer }>> {
    if (attachments.length === 0) {
        return [];
    }

    const results = await Promise.all(
        attachments.map(async (attachment) => {
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

                const arrayBuffer = await response.arrayBuffer();
                const data = Buffer.from(arrayBuffer);

                return {
                    name: attachment.name || `attachment_${attachment.id}`,
                    data,
                };
            } catch (error) {
                log.warn('Failed to reupload attachment for webhook', {
                    component: 'utils',
                    attachmentId: attachment.id,
                    attachmentUrl: attachment.url,
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