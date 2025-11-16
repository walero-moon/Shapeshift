import { aliasRepo, type Alias } from '../../identity/infra/AliasRepo';
import { log } from '../../../shared/utils/logger';

/**
 * In-memory TTL cache for alias lists per userId
 */
const aliasCache = new Map<string, { aliases: Alias[], expiresAt: number }>();
const TTL = 300000; // 5 minutes in milliseconds

/**
 * Result of matching an alias to user input text
 */
export interface MatchResult {
    alias: Alias;
    renderedText: string;
}

/**
 * Invalidate the alias cache for a specific user
 * @param userId The Discord user ID
 */
export function invalidateAliasCache(userId: string): void {
    aliasCache.delete(userId);
}

/**
 * Clear the entire alias cache (for testing)
 */
export function clearAliasCache(): void {
    aliasCache.clear();
}


/**
 * Match user input text against the user's aliases using longest-prefix wins for prefixes and exact pattern matching for patterns
 * For prefix aliases, extract the prefix part (everything before "text") and match against message start
 * For pattern aliases, check if the message exactly matches the pattern with "text" replaced by content
 *
 * @param userId The Discord user ID
 * @param text The raw text input from the user
 * @returns MatchResult if an alias matches, null otherwise
 */
export async function matchAlias(userId: string, text: string): Promise<MatchResult | null> {
    try {
        // Check cache first
        const cached = aliasCache.get(userId);
        let aliases: Alias[];

        if (cached && cached.expiresAt > Date.now()) {
            aliases = cached.aliases;
            log.info('Cache hit for alias list', {
                component: 'proxy',
                userId,
                status: 'cache_hit'
            });
        } else {
            // Cache miss or expired, fetch from DB
            const groupedAliases = await aliasRepo.listByUserGrouped(userId);
            aliases = Object.values(groupedAliases).flat();
            aliasCache.set(userId, { aliases, expiresAt: Date.now() + TTL });
            log.info('Cache miss for alias list', {
                component: 'proxy',
                userId,
                status: 'cache_miss'
            });
        }

        // Separate prefix and pattern aliases
        const prefixAliases = aliases.filter(alias => alias.kind === 'prefix');
        const patternAliases = aliases.filter(alias => alias.kind === 'pattern');

        // First, try longest-prefix wins for prefix aliases
        if (prefixAliases.length > 0) {
            let bestMatch: Alias | null = null;
            let longestPrefixLength = 0;

            const lowerText = text.toLowerCase();

            for (const alias of prefixAliases) {
                // Extract prefix as everything before "text" in trigger_norm
                const prefix = alias.triggerNorm.split('text')[0] ?? '';
                if (lowerText.startsWith(prefix)) {
                    if (prefix.length > longestPrefixLength) {
                        bestMatch = alias;
                        longestPrefixLength = prefix.length;
                    }
                }
            }

            if (bestMatch) {
                // Extract rendered text: everything after prefix, remove leading "text", trim
                const afterPrefix = text.slice(longestPrefixLength);
                const renderedText = afterPrefix.replace(/^text/, '').trim();

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
            }
        }

        // If no prefix match, try pattern aliases
        for (const alias of patternAliases) {
            // Extract prefix and suffix around "text"
            const parts = alias.triggerNorm.split('text');
            if (parts.length !== 2) continue; // Invalid pattern, skip

            const prefix = parts[0] ?? '';
            const suffix = parts[1] ?? '';

            // Check if text matches the pattern structure
            if (text.startsWith(prefix) && text.endsWith(suffix) && text.length > prefix.length + suffix.length) {
                // Extract content between prefix and suffix
                const contentStart = prefix.length;
                const contentEnd = text.length - suffix.length;
                const renderedText = text.slice(contentStart, contentEnd);

                log.info('Alias matched successfully', {
                    component: 'proxy',
                    userId,
                    aliasId: alias.id,
                    formId: alias.formId,
                    trigger: alias.triggerRaw,
                    status: 'match_success'
                });

                return {
                    alias,
                    renderedText
                };
            }
        }

        return null;
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