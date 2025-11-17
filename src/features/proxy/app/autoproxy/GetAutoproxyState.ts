import { autoproxyRepo } from '../../infra/AutoproxyRepo';
import { log } from '../../../../shared/utils/logger';
import type { AutoproxyState } from '../../infra/AutoproxyRepo';

export interface GetAutoproxyStateInput {
    userId: string;
    guildId?: string | null;
    channelId?: string | null;
}

export interface GetAutoproxyStateResult {
    success: true;
    state: AutoproxyState | null;
}

/**
 * Get active autoproxy state for a user
 *
 * Business rules:
 * - Priority order: channel → guild → global
 * - Returns the highest priority active state
 */
export async function getAutoproxyState(input: GetAutoproxyStateInput): Promise<GetAutoproxyStateResult> {
    try {
        const { userId, guildId, channelId } = input;

        // Get state with priority order (channel -> guild -> global)
        const state = await autoproxyRepo.getState(userId, guildId, channelId);

        log.debug('Autoproxy state retrieved', {
            component: 'proxy',
            userId,
            guildId: guildId || undefined,
            channelId: channelId || undefined,
            found: !!state,
            mode: state?.mode,
            status: 'autoproxy_get'
        });

        return {
            success: true,
            state,
        };
    } catch (error) {
        log.error('Failed to get autoproxy state', {
            component: 'proxy',
            userId: input.userId,
            guildId: input.guildId || undefined,
            channelId: input.channelId || undefined,
            error: error instanceof Error ? error.message : String(error),
            status: 'autoproxy_error'
        });
        throw error;
    }
}