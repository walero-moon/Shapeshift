import { eq, and } from 'drizzle-orm';
import { db } from '../../../shared/db/client';
import { aliases } from '../../../shared/db/schema';
import { generateUuidv7OrUndefined } from '../../../shared/db/uuidDetection';
import { log } from '../../../shared/utils/logger';

export interface CreateAliasData {
  triggerRaw: string;
  triggerNorm: string;
  kind: 'prefix' | 'pattern';
}

export interface Alias {
  id: string;
  userId: string;
  formId: string;
  triggerRaw: string;
  triggerNorm: string;
  kind: 'prefix' | 'pattern';
  createdAt: Date;
}

export interface AliasRepo {
  create(userId: string, formId: string, data: CreateAliasData): Promise<Alias>;
  getByForm(formId: string): Promise<Alias[]>;
  getByUser(userId: string): Promise<Alias[]>;
  getById(id: string, userId: string): Promise<Alias | null>;
  delete(aliasId: string): Promise<void>;
  findCollision(userId: string, triggerNorm: string): Promise<Alias | null>;
}

/**
 * Alias Repository using Drizzle ORM with UUIDv7 support
 * Provides database operations for alias management with time-ordered UUIDs
 */
export class DrizzleAliasRepo implements AliasRepo {
  async create(userId: string, formId: string, data: CreateAliasData): Promise<Alias> {
    if (!data.triggerRaw?.trim()) {
      throw new Error('Alias trigger is required');
    }

    if (!data.triggerNorm?.trim()) {
      throw new Error('Normalized alias trigger is required');
    }

    // Check for uniqueness constraint violation
    const collision = await this.findCollision(userId, data.triggerNorm);
    if (collision) {
      throw new Error(`Alias "${data.triggerRaw}" already exists for this user`);
    }

    // Generate UUIDv7 if database doesn't support it natively
    const id = await generateUuidv7OrUndefined();

    // Create insert data without id initially
    const insertData: Partial<typeof aliases.$inferInsert> = {
      userId,
      formId,
      triggerRaw: data.triggerRaw.trim(),
      triggerNorm: data.triggerNorm.trim(),
      kind: data.kind,
    };

    // Only include id if we need to generate it in the application layer
    if (id) {
      insertData.id = id;
    }

    try {
      const result = await db.insert(aliases).values(insertData as typeof aliases.$inferInsert).returning();
      const alias = result[0];
      if (!alias) {
        throw new Error('Failed to create alias');
      }
      return alias;
    } catch (error) {
      log.error('Failed to create alias', { component: 'identity', userId, status: 'database_error', error });
      throw error;
    }
  }

  async getByForm(formId: string): Promise<Alias[]> {
    try {
      const result = await db.select().from(aliases).where(eq(aliases.formId, formId));
      return result;
    } catch (error) {
      log.error('Failed to get aliases by form', { component: 'identity', status: 'database_error', error });
      throw error;
    }
  }

  async getByUser(userId: string): Promise<Alias[]> {
    try {
      const result = await db.select().from(aliases).where(eq(aliases.userId, userId));
      return result;
    } catch (error) {
      log.error('Failed to get aliases by user', { component: 'identity', userId, status: 'database_error', error });
      throw error;
    }
  }

  async getById(id: string, userId: string): Promise<Alias | null> {
    try {
      const result = await db.select()
        .from(aliases)
        .where(and(
          eq(aliases.id, id),
          eq(aliases.userId, userId)
        ));
      return result[0] || null;
    } catch (error) {
      log.error('Failed to get alias by id', { component: 'identity', userId, aliasId: id, status: 'database_error', error });
      throw error;
    }
  }

  async delete(aliasId: string): Promise<void> {
    try {
      const result = await db.delete(aliases).where(eq(aliases.id, aliasId)).returning();
      // In Drizzle, if no rows were affected, the result array will be empty
      if (result.length === 0) {
        throw new Error('Alias not found');
      }
    } catch (error) {
      log.error('Failed to delete alias', { component: 'identity', status: 'database_error', error });
      throw error;
    }
  }

  async findCollision(userId: string, triggerNorm: string): Promise<Alias | null> {
    try {
      const result = await db.select()
        .from(aliases)
        .where(and(
          eq(aliases.userId, userId),
          eq(aliases.triggerNorm, triggerNorm)
        ));
      return result[0] || null;
    } catch (error) {
      log.error('Failed to find collision', { component: 'identity', userId, status: 'database_error', error });
      throw error;
    }
  }
}

// Export a singleton instance for use in use cases
export const aliasRepo = new DrizzleAliasRepo();