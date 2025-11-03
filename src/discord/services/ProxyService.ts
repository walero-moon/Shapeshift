import { eq } from 'drizzle-orm';
import { WebhookClient, GuildTextBasedChannel } from 'discord.js';

import { db } from '../../db/client';
import { members, systems, proxiedMessages } from '../../db/schema';
import { WebhookRegistry } from './WebhookRegistry';
import { permissionGuard } from '../middleware/permissionGuard';

export class ProxyService {
    private webhookRegistry = new WebhookRegistry();

    /**
     * Sends a proxied message using a webhook.
     * @param options - The proxy options
     * @returns The sent message details
     */
    async sendProxied(options: {
        actorUserId: string;
        memberId: number;
        channel: GuildTextBasedChannel;
        content: string;
        attachments?: any[];
        originalMessageId: string;
    }): Promise<{ messageId: string; channelId: string }> {
        const { actorUserId, memberId, channel, content, attachments, originalMessageId } = options;

        // Validate content presence
        if (!content) {
            throw new Error('At least content must be provided');
        }

        // Load member and validate ownership
        const memberData = await db
            .select({
                name: members.name,
                avatarUrl: members.avatarUrl,
                systemId: members.systemId,
            })
            .from(members)
            .where(eq(members.id, memberId))
            .limit(1);

        if (!memberData[0]) {
            throw new Error('Member not found');
        }

        const { name, avatarUrl, systemId } = memberData[0];

        // Validate system ownership
        const system = await db
            .select()
            .from(systems)
            .where(eq(systems.id, systemId))
            .limit(1);

        if (!system[0] || system[0].ownerUserId !== actorUserId) {
            throw new Error('Actor does not own the member');
        }

        // Get GuildMember
        const guildMember = await channel.guild.members.fetch(actorUserId);

        // Call PermissionGuard
        const shaped = permissionGuard({
            member: guildMember,
            channel,
            source: { content, attachments },
        });

        if (!shaped) {
            throw new Error('Insufficient permissions to send message');
        }

        // Get or create webhook
        const webhook = await this.webhookRegistry.getOrCreate(channel);

        // Execute webhook send
        const webhookClient = new WebhookClient({ id: webhook.id, token: webhook.token });
        const sentMessage = await webhookClient.send({
            content,
            username: name,
            avatarURL: avatarUrl || undefined,
            allowedMentions: shaped.allowedMentions,
            files: shaped.files,
            flags: shaped.flags,
        });

        // Store linkage
        await db.insert(proxiedMessages).values({
            originalMessageId,
            webhookMessageId: sentMessage.id,
            webhookId: webhook.id,
            channelId: channel.id,
            actorUserId,
            memberId,
        });

        return { messageId: sentMessage.id, channelId: channel.id };
    }
}