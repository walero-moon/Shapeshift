import { Attachment } from 'discord.js';
import { retryAsync } from './retry';
import { log } from './logger';
import { Buffer } from 'buffer';
import { fetch } from 'undici';

/**
 * Re-uploads Discord attachments by downloading them and returning as buffers
 * for webhook use. Webhooks cannot directly use Discord attachment URLs.
 */
export async function reuploadAttachments(attachments: Attachment[]): Promise<Array<{ name: string; buffer: Buffer }>> {
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
                const buffer = Buffer.from(arrayBuffer);

                return {
                    name: attachment.name || `attachment_${attachment.id}`,
                    buffer,
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