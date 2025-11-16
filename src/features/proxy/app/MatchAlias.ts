import { aliasRepo, type Alias } from '../../identity/infra/AliasRepo';
import { log } from '../../../shared/utils/logger';

/**
 * Cached alias with pre-parsed tokens for efficient matching
 */
export interface CachedAlias extends Alias {
    prefix: string;
    suffix?: string;
}

/**
 * In-memory TTL cache for alias lists per userId
 */
const aliasCache = new Map<string, { aliases: CachedAlias[], expiresAt: number }>();
const TTL = 300000; // 5 minutes in milliseconds

/**
 * Cache statistics for hit rate tracking
 */
const cacheStats = { hits: 0, total: 0 };

/**
 * Result of matching an alias to user input text
 */
export interface MatchResult {
    alias: CachedAlias;
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
 * Reset cache statistics (for testing)
 */
export function resetCacheStats(): void {
    cacheStats.hits = 0;
    cacheStats.total = 0;
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
    const start = Date.now();
    try {
        cacheStats.total++;
        // Check cache first
        const cached = aliasCache.get(userId);
        let aliases: CachedAlias[];

        if (cached && cached.expiresAt > Date.now()) {
            cacheStats.hits++;
            aliases = cached.aliases;
            const hitRate = cacheStats.hits / cacheStats.total;
            log.info('Cache hit for alias list', {
                component: 'proxy',
                userId,
                status: 'cache_hit',
                hitRate
            });
        } else {
            // Cache miss or expired, fetch from DB
            const groupedAliases = await aliasRepo.listByUserGrouped(userId);
            const rawAliases = Object.values(groupedAliases).flat();
            aliases = rawAliases.map(alias => {
                const parts = alias.triggerNorm.split('text');
                const prefix = parts[0] ?? '';
                if (alias.kind === 'pattern') {
                    const suffix = parts[1] ?? '';
                    return { ...alias, prefix, suffix };
                } else {
                    return { ...alias, prefix };
                }
            });
            aliasCache.set(userId, { aliases, expiresAt: Date.now() + TTL });
            const hitRate = cacheStats.hits / cacheStats.total;
            log.info('Cache miss for alias list', {
                component: 'proxy',
                userId,
                status: 'cache_miss',
                hitRate
            });
        }

        // Separate prefix and pattern aliases
        const prefixAliases = aliases.filter(alias => alias.kind === 'prefix');
        const patternAliases = aliases.filter(alias => alias.kind === 'pattern');

        // First, try longest-prefix wins for prefix aliases
        if (prefixAliases.length > 0) {
            let bestMatch: CachedAlias | null = null;
            let longestPrefixLength = 0;

            const lowerText = text.toLowerCase();

            for (const alias of prefixAliases) {
                const prefix = alias.prefix;
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

                const duration = Date.now() - start;
                log.info('Alias matched successfully', {
                    component: 'proxy',
                    userId,
                    aliasId: bestMatch.id,
                    formId: bestMatch.formId,
                    trigger: bestMatch.triggerRaw,
                    status: 'match_success',
                    duration
                });

                return {
                    alias: bestMatch,
                    renderedText
                };
            }
        }

        // If no prefix match, try pattern aliases
        for (const alias of patternAliases) {
            if (alias.suffix === undefined) continue; // Should not happen

            const prefix = alias.prefix;
            const suffix = alias.suffix;

            // Check if text matches the pattern structure
            if (text.startsWith(prefix) && text.endsWith(suffix) && text.length > prefix.length + suffix.length) {
                // Extract content between prefix and suffix
                const contentStart = prefix.length;
                const contentEnd = text.length - suffix.length;
                const renderedText = text.slice(contentStart, contentEnd);

                const duration = Date.now() - start;
                log.info('Alias matched successfully', {
                    component: 'proxy',
                    userId,
                    aliasId: alias.id,
                    formId: alias.formId,
                    trigger: alias.triggerRaw,
                    status: 'match_success',
                    duration
                });

                return {
                    alias,
                    renderedText
                };
            }
        }

        const duration = Date.now() - start;
        log.info('No alias matched', {
            component: 'proxy',
            userId,
            status: 'match_no_match',
            duration
        });

        return null;
    } catch (error) {
        const duration = Date.now() - start;
        log.error('Failed to match alias', {
            component: 'proxy',
            userId,
            status: 'match_error',
            duration,
            error
        });
        throw error;
    }
}