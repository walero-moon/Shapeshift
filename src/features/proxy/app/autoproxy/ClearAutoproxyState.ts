import { autoproxyRepo } from '../../infra/AutoproxyRepo';
import { log } from '../../../../shared/utils/logger';

export interface ClearAutoproxyStateInput {
    userId: string;
    scope: 'channel' | 'guild' | 'global' | 'all';
    guildId?: string | null;
    channelId?: string | null;
}

export interface ClearAutoproxyStateResult {
    success: true;
    clearedCount: number;
}

/**
 * Clear autoproxy states for specified scope(s)
 *
 * Business rules:
 * - 'all' scope clears channel + guild + global entries
 * - Other scopes clear specific entries
 * - Returns count of cleared states
 */
export async function clearAutoproxyState(input: ClearAutoproxyStateInput): Promise<ClearAutoproxyStateResult> {
    try {
        const { userId, scope, guildId, channelId } = input;

        let clearedCount = 0;

        switch (scope) {
            case 'all':
                await autoproxyRepo.clearAll(userId);
                clearedCount = 1;

                break;
            case 'channel':
                if (!guildId || !channelId) {
                    throw new Error('Channel scope requires both guildId and channelId');
                }

                await autoproxyRepo.clearState(userId, guildId, channelId);
                clearedCount = 1;

                break;
            case 'guild':
                if (!guildId) {
                    throw new Error('Guild scope requires guildId');
                }

                await autoproxyRepo.clearState(userId, guildId, null);
                clearedCount = 1;

                break;
            case 'global':
                await autoproxyRepo.clearState(userId, null, null);
                clearedCount = 1;

                break;
            default:
                throw new Error(`Invalid scope: ${scope}`);
        }

        log.info('Autoproxy state cleared', {
            component: 'proxy',
            userId,
            guildId: guildId || undefined,
            channelId: channelId || undefined,
            scope,
            clearedCount,
            status: 'autoproxy_cleared'
        });

        return {
            success: true,
            clearedCount,
        };
    } catch (error) {
        log.error('Failed to clear autoproxy state', {
            component: 'proxy',
            userId: input.userId,
            guildId: input.guildId || undefined,
            channelId: input.channelId || undefined,
            scope: input.scope,
            error: error instanceof Error ? error.message : String(error),
            status: 'autoproxy_error'
        });
        throw error;
    }
}