import { eq } from 'drizzle-orm';

import { db } from '../../db/client';
import { systems, members } from '../../db/schema';
import { clampUsername } from '../utils/username';

export class FormService {
    async getForms(ownerUserId: string): Promise<typeof members.$inferSelect[]> {
        // Find the system for the owner
        const system = await db
            .select()
            .from(systems)
            .where(eq(systems.ownerUserId, ownerUserId))
            .limit(1);

        if (!system[0]) {
            return [];
        }

        // Get all forms for the system
        const formList = await db
            .select()
            .from(members)
            .where(eq(members.systemId, system[0].id));

        return formList;
    }

    async addForm(ownerUserId: string, name: string, avatarUrl?: string): Promise<typeof members.$inferSelect> {
        try {
            // Check if owner has a system
            const system = await db
                .select()
                .from(systems)
                .where(eq(systems.ownerUserId, ownerUserId))
                .limit(1);

            if (!system[0]) {
                throw new Error('Owner does not have a system');
            }

            const systemId = system[0].id;

            // Clamp name
            const clampedName = clampUsername(name);

            // Validate avatarUrl
            if (avatarUrl && !avatarUrl.match(/^https?:\/\//)) {
                throw new Error('Invalid avatar URL scheme');
            }

            // Insert form
            const result = await db
                .insert(members)
                .values({
                    systemId,
                    name: clampedName,
                    avatarUrl,
                })
                .returning();

            return result[0];
        } catch (error) {
            throw new Error('Failed to add form');
        }
    }
    async editForm(ownerUserId: string, formId: number, name?: string, avatarUrl?: string): Promise<void> {
        try {
            // Find form
            const form = await db
                .select()
                .from(members)
                .where(eq(members.id, formId))
                .limit(1);

            if (!form[0]) {
                throw new Error('Form not found');
            }

            // Check ownership
            const system = await db
                .select()
                .from(systems)
                .where(eq(systems.id, form[0].systemId))
                .limit(1);

            if (!system[0] || system[0].ownerUserId !== ownerUserId) {
                throw new Error('Not owner');
            }

            // Update
            const updateData: any = {};
            if (name !== undefined) {
                ``
                updateData.name = clampUsername(name);
            }
            if (avatarUrl !== undefined) {
                updateData.avatarUrl = avatarUrl;
            }
            if (Object.keys(updateData).length > 0) {
                await db
                    .update(members)
                    .set(updateData)
                    .where(eq(members.id, formId));
            }
        } catch (error) {
            throw new Error('Failed to edit member');
        }
    }

    async deleteForm(ownerUserId: string, formId: number): Promise<void> {
        try {
            // Find form
            const form = await db
                .select()
                .from(members)
                .where(eq(members.id, formId))
                .limit(1);

            if (!form[0]) {
                throw new Error('Form not found');
            }

            // Check ownership
            const system = await db
                .select()
                .from(systems)
                .where(eq(systems.id, form[0].systemId))
                .limit(1);

            if (!system[0] || system[0].ownerUserId !== ownerUserId) {
                throw new Error('Not owner');
            }

            // Delete
            await db
                .delete(members)
                .where(eq(members.id, formId));
        } catch (error) {
            throw new Error('Failed to delete form');
        }
    }
}