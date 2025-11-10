import { db } from '../../../shared/db/client';
import { proxiedMessages } from '../../../shared/db/schema';
import { log } from '../../../shared/utils/logger';

export interface InsertProxiedMessageData {
    id: string;
    userId: string;
    formId: string;
    guildId: string;
    channelId: string;
    webhookId: string;
    webhookToken: string;
    messageId: string;
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
    createdAt: Date;
}

export interface ProxiedMessageRepo {
    insert(data: InsertProxiedMessageData): Promise<ProxiedMessage>;
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
}

// Export a singleton instance for use in use cases
export const proxiedMessageRepo = new DrizzleProxiedMessageRepo();