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
 * - For 'latch' mode: ensure prior proxied form exists (check existing latch states)
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
                // Check if user has any existing latch states with last_form_id
                const existingLatch = await autoproxyRepo.getState(userId, effectiveGuildId, effectiveChannelId);
                if (!existingLatch || existingLatch.mode !== 'latch' || !existingLatch.lastFormId) {
                    throw new Error('No prior proxied form found. Proxy once with an alias or /send before enabling latch mode.');
                }
                break;
            }
            case 'front':
                throw new Error('Front mode is not available yet');
            default:
                throw new Error(`Invalid mode: ${mode}`);
        }

        // Set the state
        const state = await autoproxyRepo.upsertState({
            userId,
            guildId: effectiveGuildId,
            channelId: effectiveChannelId,
            mode,
            formId: mode === 'form' ? formId || null : null,
            lastFormId: null, // Will be set by RecordLatchedForm
        });

        log.info('Autoproxy state set', {
            component: 'proxy',
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
            component: 'proxy',
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