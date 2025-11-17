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

        // Update latch states with retry to handle conflicts
        await retryAsync(
            () => autoproxyRepo.recordLatch(userId, formId, guildId, channelId),
            {
                maxAttempts: 3,
                baseDelay: 100,
                maxDelay: 1000,
                backoffFactor: 2,
                component: 'proxy',
                operation: 'record_latch',
            }
        );

        log.debug('Latched form recorded', {
            component: 'proxy',
            userId,
            formId,
            guildId: guildId || undefined,
            channelId: channelId || undefined,
            status: 'latch_recorded'
        });

        return {
            success: true,
        };
    } catch (error) {
        // Don't throw - this is not critical for the main flow
        log.warn('Failed to record latched form (non-critical)', {
            component: 'proxy',
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