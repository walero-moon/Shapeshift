import { db } from '../../../shared/db/client';
import { autoproxyStates, forms } from '../../../shared/db/schema';
import { log } from '../../../shared/utils/logger';
import { eq, and, or, isNull, isNotNull, notInArray, sql } from 'drizzle-orm';

export interface InsertAutoproxyStateData {
    id?: string; // Optional: include when app generates UUID
    userId: string;
    guildId?: string | null;
    channelId?: string | null;
    mode: 'form' | 'latch' | 'front';
    formId?: string | null;
    lastFormId?: string | null;
    expiresAt?: Date | null;
}

export interface AutoproxyState {
    id: string;
    userId: string;
    guildId?: string | null;
    channelId?: string | null;
    mode: 'form' | 'latch' | 'front';
    formId?: string | null;
    lastFormId?: string | null;
    expiresAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface AutoproxyRepo {
    upsertState(data: InsertAutoproxyStateData): Promise<AutoproxyState>;
    getState(userId: string, guildId?: string | null, channelId?: string | null): Promise<AutoproxyState | null>;
    getAllStates(userId: string): Promise<AutoproxyState[]>;
    getStateById(id: string): Promise<AutoproxyState | null>;
    getStateForScope(userId: string, guildId: string | null, channelId: string | null): Promise<AutoproxyState | null>;
    clearState(userId: string, guildId?: string | null, channelId?: string | null): Promise<void>;
    clearAll(userId: string): Promise<void>;
    recordLatch(userId: string, lastFormId: string, guildId?: string | null, channelId?: string | null): Promise<void>;
    recordLatchById(id: string, lastFormId: string): Promise<void>;
    deleteMissingForm(): Promise<void>;
}

/**
 * Autoproxy Repository using Drizzle ORM
 * Provides database operations for autoproxy state management
 */
export class DrizzleAutoproxyRepo implements AutoproxyRepo {
    async upsertState(data: InsertAutoproxyStateData): Promise<AutoproxyState> {
        try {
            const setData: Record<string, unknown> = {
                mode: data.mode,
                updatedAt: sql`now()`,
            };
            if (data.formId !== undefined) setData.formId = data.formId;
            if (data.lastFormId !== undefined) setData.lastFormId = data.lastFormId;
            if (data.expiresAt !== undefined) setData.expiresAt = data.expiresAt;

            const result = await db.insert(autoproxyStates).values({
                ...data,
                updatedAt: sql`now()`,
            }).onConflictDoUpdate({
                target: [autoproxyStates.userId, autoproxyStates.guildId, autoproxyStates.channelId],
                set: setData,
            }).returning();
            const state = result[0];
            if (!state) {
                throw new Error('Failed to upsert autoproxy state');
            }
            return state;
        } catch (error) {
            log.error('Failed to upsert autoproxy state', { component: 'proxy', userId: data.userId, status: 'database_error', error });
            throw error;
        }
    }

    async getState(userId: string, guildId?: string | null, channelId?: string | null): Promise<AutoproxyState | null> {
        try {
            const conditions = [eq(autoproxyStates.userId, userId)];

            if (guildId === null) {
                conditions.push(isNull(autoproxyStates.guildId));
            } else if (guildId !== undefined) {
                conditions.push(or(eq(autoproxyStates.guildId, guildId), isNull(autoproxyStates.guildId)) as any);
            }

            if (channelId === null) {
                conditions.push(isNull(autoproxyStates.channelId));
            } else if (channelId !== undefined) {
                conditions.push(or(eq(autoproxyStates.channelId, channelId), isNull(autoproxyStates.channelId)) as any);
            }

            const result = await db
                .select()
                .from(autoproxyStates)
                .where(and(...conditions))
                .orderBy(
                    sql`${autoproxyStates.channelId} IS NOT NULL DESC`,
                    sql`${autoproxyStates.guildId} IS NOT NULL DESC`
                )
                .limit(1);

            return result[0] || null;
        } catch (error) {
            log.error('Failed to get autoproxy state', {
                component: 'proxy',
                userId,
                guildId: guildId || undefined,
                channelId: channelId || undefined,
                status: 'database_error',
                error
            });
            throw error;
        }
    }

    async getAllStates(userId: string): Promise<AutoproxyState[]> {
        try {
            const result = await db
                .select()
                .from(autoproxyStates)
                .where(eq(autoproxyStates.userId, userId))
                .orderBy(
                    sql`${autoproxyStates.channelId} IS NOT NULL DESC`,
                    sql`${autoproxyStates.guildId} IS NOT NULL DESC`
                );

            return result;
        } catch (error) {
            log.error('Failed to get all autoproxy states', {
                component: 'proxy',
                userId,
                status: 'database_error',
                error
            });
            throw error;
        }
    }

    async getStateById(id: string): Promise<AutoproxyState | null> {
        try {
            const result = await db
                .select()
                .from(autoproxyStates)
                .where(eq(autoproxyStates.id, id))
                .limit(1);

            return result[0] || null;
        } catch (error) {
            log.error('Failed to get autoproxy state by id', {
                component: 'proxy',
                autoproxyStateId: id,
                status: 'database_error',
                error
            });
            throw error;
        }
    }

    async getStateForScope(userId: string, guildId: string | null, channelId: string | null): Promise<AutoproxyState | null> {
        try {
            const conditions = [
                eq(autoproxyStates.userId, userId),
                sql`${autoproxyStates.guildId} IS NOT DISTINCT FROM ${guildId}`,
                sql`${autoproxyStates.channelId} IS NOT DISTINCT FROM ${channelId}`
            ];

            const result = await db
                .select()
                .from(autoproxyStates)
                .where(and(...conditions))
                .limit(1);

            return result[0] ?? null;
        } catch (error) {
            log.error('Failed to get autoproxy state for scope', {
                component: 'proxy',
                userId,
                guildId: guildId ?? undefined,
                channelId: channelId ?? undefined,
                status: 'database_error',
                error
            });
            throw error;
        }
    }

    async clearState(userId: string, guildId?: string | null, channelId?: string | null): Promise<void> {
        try {
            const conditions = [eq(autoproxyStates.userId, userId)];

            if (guildId !== undefined) {
                conditions.push(sql`${autoproxyStates.guildId} IS NOT DISTINCT FROM ${guildId}`);
            }

            if (channelId !== undefined) {
                conditions.push(sql`${autoproxyStates.channelId} IS NOT DISTINCT FROM ${channelId}`);
            }

            await db
                .delete(autoproxyStates)
                .where(and(...conditions));
        } catch (error) {
            log.error('Failed to clear autoproxy state', {
                component: 'proxy',
                userId,
                guildId: guildId || undefined,
                channelId: channelId || undefined,
                status: 'database_error',
                error
            });
            throw error;
        }
    }

    async clearAll(userId: string): Promise<void> {
        try {
            await db
                .delete(autoproxyStates)
                .where(eq(autoproxyStates.userId, userId));
        } catch (error) {
            log.error('Failed to clear all autoproxy states', {
                component: 'proxy',
                userId,
                status: 'database_error',
                error
            });
            throw error;
        }
    }

    async recordLatch(userId: string, lastFormId: string, guildId?: string | null, channelId?: string | null): Promise<void> {
        try {
            const conditions = [
                eq(autoproxyStates.userId, userId),
                eq(autoproxyStates.mode, 'latch')
            ];

            if (guildId !== undefined) {
                conditions.push(sql`${autoproxyStates.guildId} IS NOT DISTINCT FROM ${guildId}`);
            }

            if (channelId !== undefined) {
                conditions.push(sql`${autoproxyStates.channelId} IS NOT DISTINCT FROM ${channelId}`);
            }

            await db
                .update(autoproxyStates)
                .set({
                    lastFormId,
                    updatedAt: sql`now()`,
                })
                .where(and(...conditions));
        } catch (error) {
            log.error('Failed to record latch form', {
                component: 'proxy',
                userId,
                guildId: guildId || undefined,
                channelId: channelId || undefined,
                lastFormId,
                status: 'database_error',
                error
            });
            throw error;
        }
    }

    async deleteMissingForm(): Promise<void> {
        try {
            await db
                .delete(autoproxyStates)
                .where(and(
                    isNotNull(autoproxyStates.formId),
                    notInArray(autoproxyStates.formId, db.select({ id: forms.id }).from(forms))
                ));
        } catch (error) {
            log.error('Failed to delete autoproxy states with missing forms', {
                component: 'proxy',
                status: 'database_error',
                error
            });
            throw error;
        }
    }

    async recordLatchById(id: string, lastFormId: string): Promise<void> {
        try {
            await db
                .update(autoproxyStates)
                .set({
                    lastFormId,
                    updatedAt: sql`now()`,
                })
                .where(eq(autoproxyStates.id, id));
        } catch (error) {
            log.error('Failed to record latch form by id', {
                component: 'proxy',
                autoproxyStateId: id,
                lastFormId,
                status: 'database_error',
                error
            });
            throw error;
        }
    }
}

// Export a singleton instance for use in use cases
export const autoproxyRepo = new DrizzleAutoproxyRepo();
