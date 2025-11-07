import { aliasRepo } from '../infra/AliasRepo';
import log from '../../../shared/utils/logger';

/**
 * Remove an alias from a form
 *
 * @param aliasId The ID of the alias to remove
 * @param userId The ID of the user who owns the alias
 */
export async function removeAlias(aliasId: string, userId: string): Promise<void> {
    try {
        // First verify that the alias belongs to the user
        const userAliases = await aliasRepo.getByUser(userId);
        const alias = userAliases.find(a => a.id === aliasId);

        // Check if alias exists and belongs to the user
        if (!alias || alias.userId !== userId) {
            throw new Error('Alias not found or does not belong to user');
        }

        // Delete the alias
        await aliasRepo.delete(aliasId);
    } catch (error) {
        log.error('Failed to remove alias', {
            component: 'identity',
            userId,
            aliasId,
            error: error instanceof Error ? error.message : String(error),
            status: 'database_error'
        });
        // Re-throw for write operations to maintain data integrity
        throw error;
    }
}