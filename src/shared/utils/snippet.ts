export function createSnippet(message: { content?: string; embeds?: unknown[]; attachments?: unknown[] }): string {
    let text = message.content || '';

    if (!text) {
        const placeholders: string[] = [];
        if (message.embeds?.length) {
            placeholders.push('[embed]');
        }
        if (message.attachments?.length) {
            placeholders.push('[image]');
        }
        text = placeholders.join(' ') || '';
    }

    // Strip basic markdown
    text = text.replace(/\*\*(.*?)\*\*/g, '$1'); // bold
    text = text.replace(/\*(.*?)\*/g, '$1'); // italic
    text = text.replace(/__(.*?)__/g, '$1'); // underline
    text = text.replace(/_(.*?)_/g, '$1'); // italic
    text = text.replace(/~~(.*?)~~/g, '$1'); // strikethrough
    text = text.replace(/`(.*?)`/g, '$1'); // inline code
    text = text.replace(/```[\s\S]*?```/g, ''); // code blocks

    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();

    // Limit to ~120 chars
    if (text.length > 120) {
        text = text.substring(0, 117) + '...';
    }

    return text;
}