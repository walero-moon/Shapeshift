import { formRepo } from '../infra/FormRepo';
import { aliasRepo } from '../infra/AliasRepo';
import { normalizeAlias, getAliasKind } from './NormalizeAlias';
import log from '../../../shared/utils/logger';

export interface CreateFormInput {
    name: string;
    avatarUrl?: string | null;
}

export interface CreateFormResult {
    form: {
        id: string;
        name: string;
        avatarUrl?: string | null;
        createdAt: Date;
    };
    defaultAliases: Array<{
        triggerRaw: string;
        triggerNorm: string;
        kind: 'prefix' | 'pattern';
    }>;
    skippedAliases: Array<{
        triggerRaw: string;
        reason: string;
    }>;
}

/**
 * Create a form with automatic default aliases
 *
 * Business rules:
 * - Create the form with provided name and avatar
 * - Automatically create default aliases: "<name>:text" and "<first_letter>:text"
 * - Skip short alias if it would cause a collision
 * - Return result with form, created aliases, and any skipped aliases
 */
export async function createForm(userId: string, input: CreateFormInput): Promise<CreateFormResult> {
    try {
        // Validate input
        if (!input.name?.trim()) {
            throw new Error('Form name is required');
        }

        const name = input.name.trim();
        const avatarUrl = input.avatarUrl?.trim() || null;

        // Create the form
        const form = await formRepo.create(userId, { name, avatarUrl });

        // Create default aliases
        const defaultAliases: CreateFormResult['defaultAliases'] = [];
        const skippedAliases: CreateFormResult['skippedAliases'] = [];

        try {
            // Create name-based alias: "<name>:text"
            const nameAlias = `${name.toLowerCase()}:text`;
            const nameNorm = await normalizeAlias(nameAlias);
            const nameKind = getAliasKind(nameNorm);

            // Check for collision before creating
            const nameCollision = await aliasRepo.findCollision(userId, nameNorm);
            if (nameCollision) {
                skippedAliases.push({
                    triggerRaw: nameAlias,
                    reason: 'Alias already exists',
                });
            } else {
                await aliasRepo.create(userId, form.id, {
                    triggerRaw: nameAlias,
                    triggerNorm: nameNorm,
                    kind: nameKind,
                });
                defaultAliases.push({
                    triggerRaw: nameAlias,
                    triggerNorm: nameNorm,
                    kind: nameKind,
                });
            }

            // Create short alias: "<first_letter>:text"
            const firstLetter = name.charAt(0).toLowerCase();
            if (firstLetter && firstLetter !== name.charAt(0)) {
                const shortAlias = `${firstLetter}:text`;
                const shortNorm = await normalizeAlias(shortAlias);
                const shortKind = getAliasKind(shortNorm);

                // Check for collision before creating
                const shortCollision = await aliasRepo.findCollision(userId, shortNorm);
                if (shortCollision) {
                    skippedAliases.push({
                        triggerRaw: shortAlias,
                        reason: 'Alias already exists',
                    });
                } else {
                    await aliasRepo.create(userId, form.id, {
                        triggerRaw: shortAlias,
                        triggerNorm: shortNorm,
                        kind: shortKind,
                    });
                    defaultAliases.push({
                        triggerRaw: shortAlias,
                        triggerNorm: shortNorm,
                        kind: shortKind,
                    });
                }
            } else {
                // First letter is same as full name (single character name), skip short alias
                skippedAliases.push({
                    triggerRaw: `${firstLetter}:text`,
                    reason: 'Single character name',
                });
            }

        } catch (error) {
            // If anything fails after form creation, clean up the form
            try {
                await formRepo.delete(form.id);
            } catch (cleanupError) {
                // Log cleanup error but don't throw it
                log.error('Failed to cleanup form after alias creation error', {
                    component: 'identity',
                    error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
                    status: 'cleanup_error'
                });
            }

            throw error; // Re-throw the original error
        }

        return {
            form: {
                id: form.id,
                name: form.name,
                avatarUrl: form.avatarUrl || null,
                createdAt: form.createdAt,
            },
            defaultAliases,
            skippedAliases,
        };
    } catch (error) {
        log.error('Failed to create form', {
            component: 'identity',
            userId,
            error: error instanceof Error ? error.message : String(error),
            status: 'database_error'
        });
        // Re-throw for write operations to maintain data integrity
        throw error;
    }
}