import { eq } from 'drizzle-orm';

import { db } from '../../db/client';
import { systems, members } from '../../db/schema';
import { clampUsername } from '../utils/username';

export class MemberService {
    async getMembers(ownerUserId: string): Promise<typeof members.$inferSelect[]> {
        // Find the system for the owner
        const system = await db
            .select()
            .from(systems)
            .where(eq(systems.ownerUserId, ownerUserId))
            .limit(1);

        if (!system[0]) {
            return [];
        }

        // Get all members for the system
        const memberList = await db
            .select()
            .from(members)
            .where(eq(members.systemId, system[0].id));

        return memberList;
    }

    async addMember(ownerUserId: string, name: string, avatarUrl?: string): Promise<typeof members.$inferSelect> {
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

            // Insert member
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
            throw new Error('Failed to add member');
        }
    }
}