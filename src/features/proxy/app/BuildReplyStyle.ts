import { createSnippet } from '../../../shared/utils/snippet';

/**
 * Builds reply-style header for webhook messages.
 * Pure function that creates a small header with reply icon, user, and content.
 * Ensures content is trimmed to fit within Discord's 2000 character limit.
 */
export function buildReplyStyle(
    displayName: string | null,
    messageUrl: string | null,
    content: string,
    hasEmbeds: boolean,
    hasAttachments: boolean
): {
    headerLine: string;
} {
    // Build content snippet
    const snippet = createSnippet({
        content,
        ...(hasEmbeds && { embeds: [{} as unknown] }),
        ...(hasAttachments && { attachments: [{} as unknown] }),
    });

    // Build header with user and content
    let headerText: string;
    if (displayName) {
        // Trim content to fit within 2000 chars (header prefix + user + content + hyperlink markup)
        const prefix = `-# **↩︎ Replying to @${displayName}** `;
        const maxContentLength = 2000 - prefix.length - (messageUrl ? 4 : 0); // 4 for `[]()` markdown
        const trimmedContent = snippet.length > maxContentLength
            ? snippet.substring(0, maxContentLength - 3) + '...'
            : snippet;
        headerText = `${prefix}[${trimmedContent}](${messageUrl})`;
    } else {
        // Fallback without user
        const prefix = `-# **↩︎ Replying** `;
        const maxContentLength = 2000 - prefix.length - (messageUrl ? 4 : 0);
        const trimmedContent = snippet.length > maxContentLength
            ? snippet.substring(0, maxContentLength - 3) + '...'
            : snippet;
        headerText = `${prefix}[${trimmedContent}](${messageUrl})`;
    }

    // Wrap entire header in hyperlink if URL available
    const headerLine = messageUrl ? `${headerText}` : headerText;

    return {
        headerLine,
    };
}