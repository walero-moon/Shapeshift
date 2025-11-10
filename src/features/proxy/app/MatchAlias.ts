import { aliasRepo, type Alias } from '../../identity/infra/AliasRepo';
import { log } from '../../../shared/utils/logger';

/**
 * Result of matching an alias to user input text
 */
export interface MatchResult {
    alias: Alias;
    renderedText: string;
}

/**
 * Match user input text against the user's aliases using longest-prefix wins rule
 * Only considers prefix aliases for matching (pattern aliases may be handled differently)
 *
 * @param userId The Discord user ID
 * @param text The raw text input from the user
 * @returns MatchResult if an alias matches, null otherwise
 */
export async function matchAlias(userId: string, text: string): Promise<MatchResult | null> {
    try {
        // Get all aliases for the user
        const aliases = await aliasRepo.getByUser(userId);

        // Filter to only prefix aliases (for now, as per longest-prefix wins rule)
        const prefixAliases = aliases.filter(alias => alias.kind === 'prefix');

        if (prefixAliases.length === 0) {
            return null;
        }

        // Find the longest prefix that matches the start of the text
        let bestMatch: Alias | null = null;
        let longestLength = 0;

        for (const alias of prefixAliases) {
            if (text.toLowerCase().startsWith(alias.triggerNorm)) {
                if (alias.triggerNorm.length > longestLength) {
                    bestMatch = alias;
                    longestLength = alias.triggerNorm.length;
                }
            }
        }

        if (!bestMatch) {
            return null;
        }

        // Render the text by removing the trigger prefix
        // Since trigger_raw may have different casing, we use the normalized length to slice
        const renderedText = text.slice(longestLength).trim();

        log.info('Alias matched successfully', {
            component: 'proxy',
            userId,
            aliasId: bestMatch.id,
            formId: bestMatch.formId,
            trigger: bestMatch.triggerRaw,
            status: 'match_success'
        });

        return {
            alias: bestMatch,
            renderedText
        };
    } catch (error) {
        log.error('Failed to match alias', {
            component: 'proxy',
            userId,
            status: 'match_error',
            error
        });
        throw error;
    }
}