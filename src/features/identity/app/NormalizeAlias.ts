import log from '../../../shared/utils/logger';

/**
 * Normalize an alias trigger for storage and matching
 *
 * Business rules:
 * - Convert to lowercase
 * - Trim whitespace
 * - Collapse internal multiple whitespace to single space
 * - Validate that trigger contains the literal word "text" (case-insensitive)
 *
 * @param raw The raw alias trigger from user input
 * @returns Normalized trigger for database storage and matching
 */
export async function normalizeAlias(raw: string): Promise<string> {
    try {
        if (!raw || typeof raw !== 'string') {
            throw new Error('Alias trigger must be a non-empty string');
        }

        const trimmedRaw = raw.trim();
        if (!trimmedRaw) {
            throw new Error('Alias trigger must be a non-empty string');
        }

        // Check for literal "text" requirement (case-insensitive word boundary check)
        const textRegex = /\btext\b/i;
        if (!textRegex.test(trimmedRaw)) {
            throw new Error('Alias trigger must contain the literal word "text"');
        }

        // Additional validation: reject malformed patterns that start with bracket but don't close properly
        if ((trimmedRaw.startsWith('{') && !trimmedRaw.includes('}')) ||
            (trimmedRaw.startsWith('[') && !trimmedRaw.includes(']')) ||
            (trimmedRaw.startsWith('<') && !trimmedRaw.includes('>')) ||
            (trimmedRaw.endsWith('}') && !trimmedRaw.startsWith('{')) ||
            (trimmedRaw.endsWith(']') && !trimmedRaw.startsWith('[')) ||
            (trimmedRaw.endsWith('>') && !trimmedRaw.startsWith('<'))) {
            throw new Error('Alias trigger must contain the literal word "text"');
        }

        // Convert to lowercase, trim whitespace, and collapse internal whitespace
        return trimmedRaw
            .toLowerCase()
            .replace(/\s+/g, ' ');
    } catch (error) {
        log.error('Failed to normalize alias', {
            component: 'identity',
            error: error instanceof Error ? error.message : String(error),
            status: 'validation_error'
        });
        throw error;
    }
}

/**
 * Determine the kind of alias based on its trigger
 * 
 * @param trigger The normalized trigger
 * @returns 'prefix' for triggers anchored at start, 'pattern' for bracketed/templated styles
 */
export function getAliasKind(trigger: string): 'prefix' | 'pattern' {
    // Pattern aliases are those that start with common bracket characters
    if (trigger.startsWith('{') || trigger.startsWith('[') || trigger.startsWith('<')) {
        return 'pattern';
    }

    // Everything else is treated as a prefix alias
    return 'prefix';
}