/**
 * Assembles the webhook payload for sending messages with reply-style formatting.
 * Pure function that combines content with reply-style header and sets allowed mentions.
 */
export function assembleWebhookPayload(
    content: string,
    replyStyle: {
        headerLine: string;
        quoteLine?: string;
    } | null
) {
    const assembledContent = replyStyle
        ? `${replyStyle.headerLine}\n${content}`
        : content;
    const components: any[] = [];
    const allowedMentions = { parse: [] };

    return {
        content: assembledContent,
        components,
        allowedMentions
    };
}