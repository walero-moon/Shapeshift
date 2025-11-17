import { autoproxyRepo } from '../../infra/AutoproxyRepo';
import { formRepo } from '../../../identity/infra/FormRepo';
import { log } from '../../../../shared/utils/logger';
import type { AutoproxyState } from '../../infra/AutoproxyRepo';

export interface SetAutoproxyStateInput {
    userId: string;
    mode: 'form' | 'latch' | 'front';
    formId?: string | null;
    scope?: 'channel' | 'guild' | 'global';
    guildId?: string | null;
    channelId?: string | null;
}

export interface SetAutoproxyStateResult {
    success: true;
    state: AutoproxyState;
}

/**
 * Set autoproxy state for a user
 *
 * Business rules:
 * - Default scope to 'guild' if undefined
 * - For 'form' mode: validate form ownership
 * - For 'latch' mode: allow arming without prior form; reuse existing latched form if the same scope was already locked
 * - 'front' mode: reserved for future
 * - Set scope: channel (guildId + channelId), guild (guildId), global (null)
 */
export async function setAutoproxyState(input: SetAutoproxyStateInput): Promise<SetAutoproxyStateResult> {
    try {
        const { userId, mode, formId, scope, guildId, channelId } = input;

        // Default scope to guild
        const effectiveScope = scope || 'guild';

        // Determine guildId and channelId based on scope
        let effectiveGuildId: string | null = null;
        let effectiveChannelId: string | null = null;

        switch (effectiveScope) {
            case 'channel':
                if (!guildId || !channelId) {
                    throw new Error('Channel scope requires both guildId and channelId');
                }
                effectiveGuildId = guildId;
                effectiveChannelId = channelId;
                break;
            case 'guild':
                if (!guildId) {
                    throw new Error('Guild scope requires guildId');
                }
                effectiveGuildId = guildId;
                break;
            case 'global':
                // global scope: both null
                break;
            default:
                throw new Error(`Invalid scope: ${effectiveScope}`);
        }

        const existingState = await autoproxyRepo.getStateForScope(
            userId,
            effectiveGuildId,
            effectiveChannelId
        );

        let latchLastFormId: string | null | undefined;

        // Validate mode-specific requirements
        switch (mode) {
            case 'form': {
                if (!formId) {
                    throw new Error('Form mode requires formId');
                }
                // Validate form ownership
                const form = await formRepo.getCachedByUserAndId(userId, formId);
                if (!form) {
                    throw new Error('Form not found or not owned by user');
                }
                break;
            }
            case 'latch': {
                latchLastFormId = existingState && existingState.mode === 'latch'
                    ? existingState.lastFormId ?? null
                    : null;
                break;
            }
            case 'front':
                throw new Error('Front mode is not available yet');
            default:
                throw new Error(`Invalid mode: ${mode}`);
        }

        // Remove any existing state for this scope before inserting the new one
        await autoproxyRepo.clearState(userId, effectiveGuildId, effectiveChannelId);

        // Set the state
        const state = await autoproxyRepo.upsertState({
            userId,
            guildId: effectiveGuildId,
            channelId: effectiveChannelId,
            mode,
            formId: mode === 'form' ? formId || null : null,
            lastFormId: mode === 'latch' ? latchLastFormId ?? null : null, // RecordLatchedForm updates latch entries
        });

        log.info('Autoproxy state set', {
            component: 'autoproxy',
            userId,
            guildId: effectiveGuildId || undefined,
            channelId: effectiveChannelId || undefined,
            mode,
            scope: effectiveScope,
            status: 'autoproxy_set'
        });

        return {
            success: true,
            state,
        };
    } catch (error) {
        log.error('Failed to set autoproxy state', {
            component: 'autoproxy',
            userId: input.userId,
            guildId: input.guildId || undefined,
            channelId: input.channelId || undefined,
            mode: input.mode,
            scope: input.scope,
            error: error instanceof Error ? error.message : String(error),
            status: 'autoproxy_error'
        });
        throw error;
    }
}
