import { db } from '../../../shared/db/client';
import { proxiedMessages } from '../../../shared/db/schema';
import { log } from '../../../shared/utils/logger';
import { eq } from 'drizzle-orm';

export interface InsertProxiedMessageData {
    id?: string; // Optional: include when app generates UUID (PostgreSQL <18), omit for DB generation (PostgreSQL 18+)
    userId: string;
    formId: string;
    guildId: string;
    channelId: string;
    webhookId: string;
    webhookToken: string;
    messageId: string;
    sourceMessageId?: string | null; // Optional: original user message ID for context menu operations
}

export interface ProxiedMessage {
    id: string;
    userId: string;
    formId: string;
    guildId: string;
    channelId: string;
    webhookId: string;
    webhookToken: string;
    messageId: string;
    sourceMessageId?: string | null; // Optional: original user message ID
    createdAt: Date;
}

export interface ProxiedMessageRepo {
    insert(data: InsertProxiedMessageData): Promise<ProxiedMessage>;
    getByWebhookMessageId(messageId: string): Promise<ProxiedMessage | null>;
    getBySourceMessageId(sourceMessageId: string): Promise<ProxiedMessage | null>;
    deleteById(id: string): Promise<void>;
}

/**
 * ProxiedMessage Repository using Drizzle ORM
 * Provides database operations for proxied message tracking
 */
export class DrizzleProxiedMessageRepo implements ProxiedMessageRepo {
    async insert(data: InsertProxiedMessageData): Promise<ProxiedMessage> {
        try {
            const result = await db.insert(proxiedMessages).values(data).returning();
            const proxiedMessage = result[0];
            if (!proxiedMessage) {
                throw new Error('Failed to insert proxied message');
            }
            return proxiedMessage;
        } catch (error) {
            log.error('Failed to insert proxied message', { component: 'proxy', userId: data.userId, status: 'database_error', error });
            throw error;
        }
    }

    async getByWebhookMessageId(messageId: string): Promise<ProxiedMessage | null> {
        try {
            const result = await db
                .select()
                .from(proxiedMessages)
                .where(eq(proxiedMessages.messageId, messageId))
                .limit(1);

            return result[0] || null;
        } catch (error) {
            log.error('Failed to get proxied message by webhook message ID', {
                component: 'proxy',
                messageId,
                status: 'database_error',
                error
            });
            throw error;
        }
    }

    async getBySourceMessageId(sourceMessageId: string): Promise<ProxiedMessage | null> {
        try {
            const result = await db
                .select()
                .from(proxiedMessages)
                .where(eq(proxiedMessages.sourceMessageId, sourceMessageId))
                .limit(1);

            return result[0] || null;
        } catch (error) {
            log.error('Failed to get proxied message by source message ID', {
                component: 'proxy',
                sourceMessageId,
                status: 'database_error',
                error
            });
            throw error;
        }
    }

    async deleteById(id: string): Promise<void> {
        try {
            await db
                .delete(proxiedMessages)
                .where(eq(proxiedMessages.id, id));
        } catch (error) {
            log.error('Failed to delete proxied message', {
                component: 'proxy',
                id,
                status: 'database_error',
                error
            });
            throw error;
        }
    }
}

// Export a singleton instance for use in use cases
export const proxiedMessageRepo = new DrizzleProxiedMessageRepo();