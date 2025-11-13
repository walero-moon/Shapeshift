import { DEFAULT_ALLOWED_MENTIONS } from '../../../shared/utils/allowedMentions';
import { Form } from '../../identity/infra/FormRepo';
import { ProxyAttachment, AllowedMentions } from '../../../shared/ports/ChannelProxyPort';

/**
 * Builds a webhook payload for proxying a message as a form.
 * Enforces Discord limits: content ≤ 2000 characters.
 * Sanitizes content by trimming whitespace.
 * Keeps attachments as-is since reupload happens in the adapter layer.
 */
export function buildProxyMessage(
    form: Form,
    body: string,
    attachments?: ProxyAttachment[] // Reuploaded attachments in standardized format
): {
    username: string;
    avatar_url?: string;
    content: string;
    allowed_mentions: AllowedMentions;
    attachments?: ProxyAttachment[];
} {
    // Sanitize and truncate content
    const sanitizedContent = body.trim();
    const content = sanitizedContent.length > 2000 ? sanitizedContent.slice(0, 2000) : sanitizedContent;

    const payload: {
        username: string;
        avatar_url?: string;
        content: string;
        allowed_mentions: AllowedMentions;
        attachments?: ProxyAttachment[];
    } = {
        username: form.name,
        content,
        allowed_mentions: DEFAULT_ALLOWED_MENTIONS,
    };

    if (form.avatarUrl) {
        payload.avatar_url = form.avatarUrl;
    }

    if (attachments) {
        payload.attachments = attachments;
    }

    return payload;
}