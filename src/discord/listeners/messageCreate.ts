import { Client, Events, Message, PermissionsBitField } from 'discord.js';
import { eq } from 'drizzle-orm';

import { env } from '../../config/env';
import { db } from '../../db/client';
import { systems } from '../../db/schema';
import { logger } from '../../utils/logger';
import { permissionGuard } from '../middleware/permissionGuard';
import { MemberService } from '../services/MemberService';
import { ProxyService } from '../services/ProxyService';
import { parseTag } from '../utils/tagParser';

const proxyService = new ProxyService();
const memberService = new MemberService();

export const registerMessageCreateListener = async (client: Client) => {
    client.on(Events.MessageCreate, async (message: Message) => {
        try {
            // Feature flag check
            if (!env.ENABLE_TAG_PROXY) {
                return;
            }

            // Ignore DMs, bots, and webhooks
            if (!message.guild || message.author.bot || message.webhookId) {
                return;
            }

            // Only process guild text/thread messages
            if (!message.channel.isTextBased() || message.channel.isDMBased()) {
                return;
            }

            // Get members for the user
            const membersList = await memberService.getMembers(message.author.id);
            const memberNames = membersList.map(m => m.name);

            // Parse tag
            const parsed = parseTag(message.content, memberNames);
            if (!parsed.matched) {
                return;
            }

            const { memberName, content } = parsed;

            // Find member ID
            const member = membersList.find(m => m.name.toLowerCase() === memberName!.toLowerCase());
            if (!member) {
                return;
            }

            // Validate ownership (already done in getMembers, but double-check)
            const system = await db
                .select()
                .from(systems)
                .where(eq(systems.id, member.systemId))
                .limit(1);

            if (!system[0] || system[0].ownerUserId !== message.author.id) {
                return;
            }

            // Get GuildMember
            const guildMember = await message.guild.members.fetch(message.author.id);

            // Apply PermissionGuard
            const attachments = message.attachments.map(a => a);
            const shaped = permissionGuard({
                member: guildMember,
                channel: message.channel,
                source: { content: content!, attachments },
            });

            if (!shaped) {
                return;
            }

            // Call ProxyService.sendProxied
            await proxyService.sendProxied({
                actorUserId: message.author.id,
                memberId: member.id,
                channel: message.channel,
                content: content!,
                attachments: shaped.files,
                originalMessageId: message.id,
            });

            // Optionally delete original message if bot has Manage Messages
            const botMember = await message.guild.members.fetch(client.user!.id);
            if (botMember.permissionsIn(message.channel).has(PermissionsBitField.Flags.ManageMessages)) {
                await message.delete();
            }
        } catch (error) {
            logger.error('Error in messageCreate listener', error);
            // Handle errors gracefully without user-visible messages
        }
    });

    logger.info('Registered messageCreate listener for tag proxying.');
};