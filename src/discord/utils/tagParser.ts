/**
 * Parses a message for tag format: MemberName: message text.
 * Handles case-insensitive member matching, escape with leading \, no-colon detection, and content length validation (≤2000 chars).
 * @param message - The message string to parse.
 * @param members - Array of member names for matching.
 * @returns Object indicating if matched, with memberName and content if applicable.
 */
export function parseTag(message: string, members: string[]): { matched: boolean; memberName?: string; content?: string } {
    // Escape with leading \
    if (message.startsWith('\\')) {
        return { matched: false };
    }

    // Find first colon
    const colonIndex = message.indexOf(':');
    if (colonIndex === -1) {
        return { matched: false };
    }

    const potentialMember = message.substring(0, colonIndex).trim();
    const content = message.substring(colonIndex + 1).trim();

    // Content length validation
    if (content.length > 2000) {
        return { matched: false };
    }

    // Case-insensitive member matching
    const matchedMember = members.find(member => member.toLowerCase() === potentialMember.toLowerCase());
    if (matchedMember) {
        return { matched: true, memberName: matchedMember, content };
    }

    return { matched: false };
}