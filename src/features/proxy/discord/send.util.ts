/**
 * Assembles the webhook payload for sending messages with reply-style formatting.
 * Pure function that combines content with reply-style header/quote and adds Jump button if URL present.
 */
export function assembleWebhookPayload(
    content: string,
    replyStyle: {
        headerLine: string;
        quoteLine: string;
        jumpUrl?: string;
        allowedMentions: object;
    } | null
) {
    let assembledContent = content;
    const components: any[] = [];
    let allowedMentions: any = { parse: [] };

    if (replyStyle) {
        // Prepend header and quote lines
        assembledContent = `${replyStyle.headerLine}\n${replyStyle.quoteLine}\n${content}`;

        // Enforce 2000 char limit on assembled content
        if (assembledContent.length > 2000) {
            assembledContent = assembledContent.slice(0, 1997) + '...';
        }

        // Add Jump button if URL present
        if (replyStyle.jumpUrl) {
            components.push({
                type: 1, // ACTION_ROW
                components: [{
                    type: 2, // BUTTON
                    style: 5, // LINK
                    label: 'Jump',
                    url: replyStyle.jumpUrl
                }]
            });
        }

        // Use allowed mentions from reply style
        allowedMentions = replyStyle.allowedMentions;
    }

    return {
        content: assembledContent,
        components,
        allowedMentions
    };
}