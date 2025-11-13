import { Message, TextChannel } from 'discord.js';
import { matchAlias } from '../../../features/proxy/app/MatchAlias';
import { validateUserChannelPerms } from '../../../features/proxy/app/ValidateUserChannelPerms';
import { proxyCoordinator } from '../../../features/proxy/app/ProxyCoordinator';
import { formRepo } from '../../../features/identity/infra/FormRepo';
import { DiscordChannelProxy } from '../DiscordChannelProxy';
import { log } from '../../../shared/utils/logger';
import { handleDegradedModeError } from '../../../shared/utils/errorHandling';
import { reuploadAttachments } from '../../../shared/utils/attachments';

/**
 * Message create listener for tag-based proxying
 * Listens for guild text messages that match user aliases and proxies them as forms
 */
export async function messageCreateProxy(message: Message) {
    console.log('🔍 DEBUG: messageCreateProxy called', {
        userId: message.author.id,
        channelId: message.channelId,
        guildId: message.guildId,
        content: message.content,
        hasAttachments: message.attachments.size > 0,
        isBot: message.author.bot,
    });

    log.debug('Message received', {
        component: 'proxy',
        userId: message.author.id,
        guildId: message.guildId || undefined,
        channelId: message.channelId,
        content: message.content ? message.content.substring(0, 100) : undefined, // Truncate for logging
        hasAttachments: message.attachments.size > 0,
        isBot: message.author.bot,
        status: 'message_received'
    });

    // Skip bot messages
    if (message.author.bot) {
        console.log('🔍 DEBUG: Skipping bot message');
        log.debug('Skipping bot message', {
            component: 'proxy',
            userId: message.author.id,
            status: 'skipped_bot'
        });
        return;
    }

    // Skip messages without content
    if (!message.content) {
        console.log('🔍 DEBUG: Skipping message without content');
        log.debug('Skipping message without content', {
            component: 'proxy',
            userId: message.author.id,
            status: 'skipped_no_content'
        });
        return;
    }

    // Ignore DMs - only process guild messages
    if (!message.guildId) {
        console.log('🔍 DEBUG: Skipping DM message');
        log.debug('Skipping DM message', {
            component: 'proxy',
            userId: message.author.id,
            status: 'skipped_dm'
        });
        return;
    }

    console.log('🔍 DEBUG: Passed all filters, proceeding to alias matching');

    log.debug('Processing guild message for proxying', {
        component: 'proxy',
        userId: message.author.id,
        guildId: message.guildId || undefined,
        channelId: message.channelId,
        content: message.content,
        status: 'processing'
    });

    try {
        console.log('🔍 DEBUG: About to call matchAlias');
        // Check if message matches any alias for the user
        const match = await matchAlias(message.author.id, message.content);

        console.log('🔍 DEBUG: matchAlias result', {
            matchFound: !!match,
            aliasId: match?.alias.id,
            renderedText: match?.renderedText,
        });

        log.debug('Alias matching result', {
            component: 'proxy',
            userId: message.author.id,
            content: message.content,
            matchFound: !!match,
            aliasId: match?.alias.id,
            renderedText: match?.renderedText,
            status: match ? 'match_found' : 'no_match'
        });

        if (!match) {
            console.log('🔍 DEBUG: No alias match found, skipping proxy');
            log.debug('No alias match found, skipping proxy', {
                component: 'proxy',
                userId: message.author.id,
                status: 'skipped_no_match'
            });
            return;
        }

        console.log('🔍 DEBUG: Alias match found, proceeding to form lookup');

        // Get the form associated with the matched alias
        const form = await formRepo.getById(match.alias.formId);

        if (!form) {
            log.warn('Form not found for alias', {
                component: 'proxy',
                userId: message.author.id,
                aliasId: match.alias.id,
                formId: match.alias.formId,
                status: 'form_not_found'
            });
            return;
        }

        // Collect Discord.js attachments
        const discordAttachments = Array.from(message.attachments.values());

        // Validate user permissions in the channel
        const hasPerms = await validateUserChannelPerms(
            message.author.id,
            message.channel as TextChannel,
            discordAttachments
        );

        log.debug('Permission check result', {
            component: 'proxy',
            userId: message.author.id,
            channelId: message.channelId,
            hasPerms,
            status: hasPerms ? 'perms_granted' : 'perms_denied'
        });

        if (!hasPerms) {
            log.info('User lacks permissions to proxy in this channel', {
                component: 'proxy',
                userId: message.author.id,
                guildId: message.guildId || undefined,
                channelId: message.channelId,
                status: 'perms_denied'
            });
            return;
        }

        // Reupload Discord attachments to standardized format
        const standardizedAttachments = await reuploadAttachments(
            discordAttachments.map(attachment => ({
                name: attachment.name,
                url: attachment.url,
                id: attachment.id
            }))
        );

        // Create channel proxy instance
        const channelProxy = new DiscordChannelProxy(message.channelId);

        // Check for reply context
        let replyTo: { guildId: string; channelId: string; messageId: string } | undefined;
        if (message.reference && message.reference.guildId && message.reference.channelId && message.reference.messageId) {
            replyTo = {
                guildId: message.reference.guildId,
                channelId: message.reference.channelId,
                messageId: message.reference.messageId
            };
            console.log('🔍 DEBUG: replyTo detected', replyTo);
            log.debug('Reply context detected', {
                component: 'proxy',
                userId: message.author.id,
                replyTo,
                status: 'reply_context_detected'
            });
        } else {
            console.log('🔍 DEBUG: no replyTo context');
            log.debug('No reply context', {
                component: 'proxy',
                userId: message.author.id,
                status: 'no_reply_context'
            });
        }

        // Proxy the message via coordinator with standardized attachments
        await proxyCoordinator(
            message.author.id,
            form.id,
            message.channelId,
            message.guildId,
            match.renderedText,
            channelProxy,
            standardizedAttachments,
            replyTo
        );

        log.info('Message proxied successfully via tag', {
            component: 'proxy',
            userId: message.author.id,
            formId: form.id,
            aliasId: match.alias.id,
            guildId: message.guildId || undefined,
            channelId: message.channelId,
            status: 'proxy_success'
        });

        // Delete the original user message after successful proxying
        await handleDegradedModeError(
            async () => {
                await message.delete();
                log.debug('Original message deleted after successful proxy', {
                    component: 'proxy',
                    userId: message.author.id,
                    guildId: message.guildId || undefined,
                    channelId: message.channelId,
                    status: 'original_message_deleted'
                });
            },
            {
                component: 'proxy',
                userId: message.author.id,
                guildId: message.guildId || undefined,
                channelId: message.channelId,
                status: 'degraded_mode_fallback'
            },
            undefined,
            'Failed to delete original message after proxy'
        );

    } catch (error) {
        log.error('Failed to proxy message via tag', {
            component: 'proxy',
            userId: message.author.id,
            guildId: message.guildId,
            channelId: message.channelId,
            status: 'proxy_error',
            error
        });

        // Log error but don't throw - proxy failures should not crash the bot
    }
}