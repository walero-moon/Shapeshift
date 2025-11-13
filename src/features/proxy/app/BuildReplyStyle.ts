import { createSnippet } from '../../../shared/utils/snippet';

/**
 * Builds reply-style metadata for webhook messages.
 * Pure function that creates header, quote snippet, and jump URL.
 * Ensures header + quote combined stay under 2000 characters.
 */
export function buildReplyStyle(
    userId: string | null,
    messageUrl: string | null,
    content: string,
    hasEmbeds: boolean,
    hasAttachments: boolean
): {
    headerLine: string;
    quoteLine: string;
    jumpUrl?: string;
    allowedMentions: object;
} {
    // Build content snippet
    const snippet = createSnippet({
        content,
        ...(hasEmbeds && { embeds: [{} as unknown] }),
        ...(hasAttachments && { attachments: [{} as unknown] }),
    });

    // Build header
    const headerLine = userId
        ? `-# ↩︎ Replying to <@${userId}>`
        : `-# ↩︎ Replying`;

    // Quote line is the snippet, truncated if needed to fit within 2000 chars combined
    const maxQuoteLength = 2000 - headerLine.length - 1; // -1 for newline
    const quoteLine = snippet.length > maxQuoteLength
        ? snippet.substring(0, maxQuoteLength - 3) + '...'
        : snippet;

    // For reply-style, we need to allow user mentions in the header
    const allowedMentions = {
        parse: ['users'] as const,
        repliedUser: false,
    };

    const result: {
        headerLine: string;
        quoteLine: string;
        jumpUrl?: string;
        allowedMentions: object;
    } = {
        headerLine,
        quoteLine,
        allowedMentions,
    };

    if (messageUrl) {
        result.jumpUrl = messageUrl;
    }

    return result;
}