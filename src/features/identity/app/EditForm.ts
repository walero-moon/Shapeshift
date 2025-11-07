import { formRepo } from '../infra/FormRepo';
import log from '../../../shared/utils/logger';

export interface EditFormInput {
    name?: string;
    avatarUrl?: string | null;
}

export interface EditFormResult {
    id: string;
    name: string;
    avatarUrl?: string | null;
    createdAt: Date;
}

/**
 * Edit an existing form
 *
 * @param formId The ID of the form to edit
 * @param input The fields to update
 * @returns The updated form
 */
export async function editForm(formId: string, input: EditFormInput): Promise<EditFormResult> {
    try {
        // Validate that at least one field is being updated
        if (input.name === undefined && input.avatarUrl === undefined) {
            throw new Error('At least one field must be provided for update');
        }

        // Validate name if provided
        if (input.name !== undefined && !input.name?.trim()) {
            throw new Error('Form name cannot be empty');
        }

        const form = await formRepo.updateNameAvatar(formId, input);

        return {
            id: form.id,
            name: form.name,
            avatarUrl: form.avatarUrl || null,
            createdAt: form.createdAt,
        };
    } catch (error) {
        log.error('Failed to edit form', {
            component: 'identity',
            formId,
            error: error instanceof Error ? error.message : String(error),
            status: 'database_error'
        });
        // Re-throw for write operations to maintain data integrity
        throw error;
    }
}