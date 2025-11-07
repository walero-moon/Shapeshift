import { formRepo } from '../infra/FormRepo';
import { aliasRepo } from '../infra/AliasRepo';
import log from '../../../shared/utils/logger';

export interface ListAliasesResult {
    form: {
        id: string;
        name: string;
        avatarUrl?: string | null;
    };
    aliases: Array<{
        id: string;
        triggerRaw: string;
        triggerNorm: string;
        kind: 'prefix' | 'pattern';
        createdAt: Date;
    }>;
}

/**
 * List all aliases for a form
 *
 * @param formId The ID of the form
 * @param userId The ID of the user who owns the form
 * @returns The form and its aliases
 */
export async function listAliases(formId: string, userId: string): Promise<ListAliasesResult> {
    try {
        // Verify form exists and belongs to user
        const form = await formRepo.getById(formId);
        if (!form) {
            throw new Error('Form not found');
        }

        if (form.userId !== userId) {
            throw new Error('Form does not belong to user');
        }

        // Get aliases for the form
        const aliases = await aliasRepo.getByForm(formId);

        return {
            form: {
                id: form.id,
                name: form.name,
                avatarUrl: form.avatarUrl || null,
            },
            aliases: aliases.map(alias => ({
                id: alias.id,
                triggerRaw: alias.triggerRaw,
                triggerNorm: alias.triggerNorm,
                kind: alias.kind,
                createdAt: alias.createdAt,
            })),
        };
    } catch (error) {
        log.error('Failed to list aliases', {
            component: 'identity',
            userId,
            formId,
            error: error instanceof Error ? error.message : String(error),
            status: 'database_error'
        });
        // Return empty result on database failure for graceful degradation
        return {
            form: {
                id: formId,
                name: '',
                avatarUrl: null,
            },
            aliases: [],
        };
    }
}