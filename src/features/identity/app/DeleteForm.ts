import { formRepo } from '../infra/FormRepo';
import log from '../../../shared/utils/logger';

/**
 * Delete a form and all its aliases
 *
 * @param formId The ID of the form to delete
 * @param userId The ID of the user performing the deletion
 * @throws Error if the form doesn't exist or doesn't belong to user
 */
export async function deleteForm(formId: string, userId: string): Promise<void> {
    try {
        // Check if the form exists and verify ownership
        const form = await formRepo.getById(formId);
        if (!form) {
            throw new Error(`Form not found`);
        }

        if (form.userId !== userId) {
            throw new Error('Form does not belong to user');
        }

        // Delete the form itself; aliases are removed via ON DELETE CASCADE
        await formRepo.delete(formId);
    } catch (error) {
        log.error('Failed to delete form', {
            component: 'identity',
            formId,
            userId,
            error: error instanceof Error ? error.message : String(error),
            status: 'database_error'
        });
        // Re-throw for write operations to maintain data integrity
        throw error;
    }
}