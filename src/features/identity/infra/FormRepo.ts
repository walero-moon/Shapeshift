import { eq } from 'drizzle-orm';
import { db } from '../../../shared/db/client';
import { forms } from '../../../shared/db/schema';
import { generateUuidv7OrUndefined } from '../../../shared/db/uuidDetection';
import { log } from '../../../shared/utils/logger';

export interface CreateFormData {
  name: string;
  avatarUrl?: string | null;
}

export interface Form {
  id: string;
  userId: string;
  name: string;
  avatarUrl?: string | null;
  createdAt: Date;
}

export interface FormRepo {
  create(userId: string, data: CreateFormData): Promise<Form>;
  getById(id: string): Promise<Form | null>;
  getByUser(userId: string): Promise<Form[]>;
  updateNameAvatar(id: string, data: Partial<CreateFormData>): Promise<Form>;
  delete(id: string): Promise<void>;
}

/**
 * Form Repository using Drizzle ORM with UUIDv7 support
 * Provides database operations for form management with time-ordered UUIDs
 */
export class DrizzleFormRepo implements FormRepo {
  async create(userId: string, data: CreateFormData): Promise<Form> {
    if (!data.name?.trim()) {
      throw new Error('Form name is required');
    }

    // Generate UUIDv7 if database doesn't support it natively
    const id = await generateUuidv7OrUndefined();

    // Create insert data without id initially
    const insertData: Partial<typeof forms.$inferInsert> = {
      userId,
      name: data.name.trim(),
      avatarUrl: data.avatarUrl?.trim() || null,
    };

    // Only include id if we need to generate it in the application layer
    if (id) {
      insertData.id = id;
    }

    try {
      const result = await db.insert(forms).values(insertData as typeof forms.$inferInsert).returning();
      const form = result[0];
      if (!form) {
        throw new Error('Failed to create form');
      }
      return form;
    } catch (error) {
      log.error('Failed to create form', { component: 'identity', userId, status: 'database_error', error });
      throw error;
    }
  }

  async getById(id: string): Promise<Form | null> {
    try {
      const result = await db.select().from(forms).where(eq(forms.id, id));
      return result[0] || null;
    } catch (error) {
      log.error('Failed to get form by ID', { component: 'identity', status: 'database_error', error });
      throw error;
    }
  }

  async getByUser(userId: string): Promise<Form[]> {
    try {
      const result = await db.select().from(forms).where(eq(forms.userId, userId));
      return result;
    } catch (error) {
      log.error('Failed to get forms by user', { component: 'identity', userId, status: 'database_error', error });
      throw error;
    }
  }

  async updateNameAvatar(id: string, data: Partial<CreateFormData>): Promise<Form> {
    const updateData: { name?: string; avatarUrl?: string | null } = {};

    if (data.name !== undefined) {
      if (!data.name?.trim()) {
        throw new Error('Form name cannot be empty');
      }
      updateData.name = data.name.trim();
    }

    if (data.avatarUrl !== undefined) {
      updateData.avatarUrl = data.avatarUrl?.trim() || null;
    }

    if (Object.keys(updateData).length === 0) {
      throw new Error('No fields to update');
    }

    try {
      const result = await db.update(forms)
        .set(updateData)
        .where(eq(forms.id, id))
        .returning();
      const form = result[0];
      if (!form) {
        throw new Error('Form not found');
      }
      return form;
    } catch (error) {
      log.error('Failed to update form', { component: 'identity', status: 'database_error', error });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await db.delete(forms).where(eq(forms.id, id));
    } catch (error) {
      log.error('Failed to delete form', { component: 'identity', status: 'database_error', error });
      throw error;
    }
  }
}

// Export a singleton instance for use in use cases
export const formRepo = new DrizzleFormRepo();