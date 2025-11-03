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
                logger.debug('Tag proxy disabled, skipping message');
                return;
            }

            // Ignore DMs, bots, and webhooks
            if (!message.guild || message.author.bot || message.webhookId) {
                logger.debug('Ignoring DM/bot/webhook message');
                return;
            }

            // Only process guild text/thread messages
            if (!message.channel.isTextBased() || message.channel.isDMBased()) {
                logger.debug('Ignoring non-text guild channel');
                return;
            }

            logger.debug(`Processing message: "${message.content}" from ${message.author.username}`);

            // Get members for the user
            const membersList = await memberService.getMembers(message.author.id);
            const memberNames = membersList.map(m => m.name);

            logger.debug(`User has ${membersList.length} members: [${memberNames.join(', ')}]`);

            // Parse tag
            const parsed = parseTag(message.content, memberNames);
            logger.debug(`Tag parse result: ${JSON.stringify(parsed)}`);
            if (!parsed.matched) {
                logger.debug('No tag match found');
                return;
            }

            const { memberName, content } = parsed;

            logger.debug(`Matched member: ${memberName}, content: "${content}"`);

            // Find member ID
            const member = membersList.find(m => m.name.toLowerCase() === memberName!.toLowerCase());
            if (!member) {
                logger.debug(`Member "${memberName}" not found in user's members`);
                return;
            }

            logger.debug(`Found member ID: ${member.id} for name: ${member.name}`);

            // Validate ownership (already done in getMembers, but double-check)
            const system = await db
                .select()
                .from(systems)
                .where(eq(systems.id, member.systemId))
                .limit(1);

            if (!system[0] || system[0].ownerUserId !== message.author.id) {
                logger.debug('Ownership validation failed');
                return;
            }

            logger.debug('Ownership validated, proceeding with proxy');

            // Get GuildMember
            const guildMember = await message.guild.members.fetch(message.author.id);
            logger.debug('Fetched guild member successfully');

            // Apply PermissionGuard
            const attachments = message.attachments.map(a => a);
            logger.debug(`Message has ${attachments.length} attachments`);
            const shaped = permissionGuard({
                member: guildMember,
                channel: message.channel,
                source: { content: content!, attachments },
            });

            if (!shaped) {
                logger.debug('Permission guard failed');
                return;
            }

            logger.debug('Permission guard passed, proceeding with proxy');

            // Call ProxyService.sendProxied
            logger.debug('Calling ProxyService.sendProxied');
            await proxyService.sendProxied({
                actorUserId: message.author.id,
                memberId: member.id,
                channel: message.channel,
                content: content!,
                attachments: shaped.files,
                originalMessageId: message.id,
            });

            logger.debug('Proxy successful, checking for message deletion');

            // Optionally delete original message if bot has Manage Messages
            const botMember = await message.guild.members.fetch(client.user!.id);
            if (botMember.permissionsIn(message.channel).has(PermissionsBitField.Flags.ManageMessages)) {
                logger.debug('Bot has Manage Messages, deleting original message');
                await message.delete();
            } else {
                logger.debug('Bot lacks Manage Messages, leaving original message');
            }
        } catch (error) {
            logger.error('Error in messageCreate listener', error);
            // Handle errors gracefully without user-visible messages
        }
    });

    logger.info('Registered messageCreate listener for tag proxying.');
};