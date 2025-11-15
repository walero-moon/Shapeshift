import { formRepo } from '../infra/FormRepo';
import { aliasRepo } from '../infra/AliasRepo';
import { normalizeAlias, getAliasKind } from './normalizeAlias';
import log from '../../../shared/utils/logger';

export interface AddAliasInput {
    trigger: string;
}

/**
 * Add an alias to a form
 *
 * Business rules:
 * - Alias trigger must contain the literal word "text" (case-insensitive)
 * - Normalize the trigger for storage and matching
 * - Enforce uniqueness per user
 * - Determine alias kind based on trigger pattern
 *
 * @param formId The ID of the form to add the alias to
 * @param userId The ID of the user who owns the form
 * @param input The alias trigger
 * @returns The created alias
 */
export async function addAlias(formId: string, userId: string, input: AddAliasInput): Promise<{
    id: string;
    triggerRaw: string;
    triggerNorm: string;
    kind: 'prefix' | 'pattern';
    createdAt: Date;
}> {
    try {
        // Validate input
        if (!input.trigger?.trim()) {
            throw new Error('Alias trigger is required');
        }

        const triggerRaw = input.trigger.trim();

        // Check for literal "text" requirement (case-insensitive word boundary check)
        const textRegex = /\btext\b/i;
        if (!textRegex.test(triggerRaw)) {
            throw new Error('Alias trigger must contain the literal word "text"');
        }

        // Normalize the trigger
        const triggerNorm = await normalizeAlias(triggerRaw);

        // Determine alias kind
        const kind = getAliasKind(triggerNorm);

        // Verify form exists and belongs to user
        const form = await formRepo.getById(formId);
        if (!form) {
            throw new Error('Form not found');
        }

        if (form.userId !== userId) {
            throw new Error('Form does not belong to user');
        }

        // Check for alias collision before creating
        const collision = await aliasRepo.findCollision(userId, triggerNorm);
        if (collision) {
            throw new Error(`Alias "${triggerRaw}" already exists for this user`);
        }

        // Create the alias
        const alias = await aliasRepo.create(userId, formId, {
            triggerRaw,
            triggerNorm,
            kind,
        });

        return {
            id: alias.id,
            triggerRaw: alias.triggerRaw,
            triggerNorm: alias.triggerNorm,
            kind: alias.kind,
            createdAt: alias.createdAt,
        };
    } catch (error) {
        log.error('Failed to add alias', {
            component: 'identity',
            userId,
            formId,
            error: error instanceof Error ? error.message : String(error),
            status: 'database_error'
        });
        // Re-throw for write operations to maintain data integrity
        throw error;
    }
}