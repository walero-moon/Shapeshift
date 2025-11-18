import { autoproxyRepo } from '../../infra/AutoproxyRepo';
import { retryAsync } from '../../../../shared/utils/retry';
import { log } from '../../../../shared/utils/logger';

export interface RecordLatchedFormInput {
    userId: string;
    formId: string;
    guildId?: string | null;
    channelId?: string | null;
}

export interface RecordLatchedFormResult {
    success: true;
}

/**
 * Record the last proxied form for latch mode
 *
 * Business rules:
 * - Updates last_form_id for all latch states matching the scope
 * - Uses retryAsync to handle conflicts gracefully
 * - Doesn't block main flow if update fails
 */
export async function recordLatchedForm(input: RecordLatchedFormInput): Promise<RecordLatchedFormResult> {
    try {
        const { userId, formId, guildId, channelId } = input;

        const states = await autoproxyRepo.getAllStates(userId);
        const targets = states.filter((state) => {
            if (state.mode !== 'latch') {
                return false;
            }

            // Channel-specific update
            if (channelId) {
                return state.channelId === channelId;
            }

            // Guild-specific update (channelId null but guild provided)
            if (!channelId && guildId) {
                return !state.channelId && state.guildId === guildId;
            }

            // Global update (neither guild nor channel provided)
            if (!channelId && !guildId) {
                return !state.channelId && !state.guildId;
            }

            return false;
        });

        if (targets.length === 0) {
            return { success: true };
        }

        await Promise.all(targets.map((state) =>
            retryAsync(
                () => autoproxyRepo.recordLatchById(state.id, formId),
                {
                    maxAttempts: 3,
                    baseDelay: 100,
                    maxDelay: 1000,
                    backoffFactor: 2,
                    component: 'proxy',
                    operation: 'record_latch',
                }
            )
        ));

        log.debug('Latched form recorded', {
            component: 'autoproxy',
            userId,
            formId,
            guildId: guildId || undefined,
            channelId: channelId || undefined,
            updatedStates: targets.map((state) => state.id),
            status: 'latch_recorded'
        });

        return {
            success: true,
        };
    } catch (error) {
        // Don't throw - this is not critical for the main flow
        log.warn('Failed to record latched form (non-critical)', {
            component: 'autoproxy',
            userId: input.userId,
            formId: input.formId,
            guildId: input.guildId || undefined,
            channelId: input.channelId || undefined,
            error: error instanceof Error ? error.message : String(error),
            status: 'latch_record_failed'
        });

        return {
            success: true, // Still return success since it's not critical
        };
    }
}
