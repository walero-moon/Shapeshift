import { Message } from 'discord.js';
import { matchAlias } from '../../../features/proxy/app/MatchAlias';
import { sendAsForm } from '../../../features/proxy/app/SendAsForm';
import { formRepo } from '../../../features/identity/infra/FormRepo';
import { DiscordChannelProxy } from '../DiscordChannelProxy';
import { log } from '../../../shared/utils/logger';

/**
 * Message create listener for tag-based proxying
 * Listens for messages that match user aliases and proxies them as forms
 */
export async function messageCreateProxy(message: Message) {
    // Skip bot messages
    if (message.author.bot) {
        return;
    }

    // Skip messages without content
    if (!message.content) {
        return;
    }

    try {
        // Check if message matches any alias for the user
        const match = await matchAlias(message.author.id, message.content);

        if (!match) {
            return;
        }

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

        // Prepare input for SendAsForm
        const input = {
            userId: message.author.id,
            form,
            text: match.renderedText,
            attachments: message.attachments.map(attachment => attachment),
            channelContext: {
                guildId: message.guildId!,
                channelId: message.channelId,
            },
        };

        log.info('Prepared input for sendAsForm', {
            userId: input.userId,
            formId: input.form.id,
            text: input.text,
            attachmentsCount: input.attachments?.length || 0,
            channelContext: input.channelContext,
        });

        // Create channel proxy instance
        const channelProxy = new DiscordChannelProxy(message.channelId);

        // Send the message as the form
        await sendAsForm(input, channelProxy);

        log.info('Message proxied successfully via tag', {
            component: 'proxy',
            userId: message.author.id,
            formId: form.id,
            aliasId: match.alias.id,
            guildId: message.guildId || undefined,
            channelId: message.channelId,
            status: 'proxy_success'
        });

    } catch (error) {
        log.error('Failed to proxy message via tag', {
            component: 'proxy',
            userId: message.author.id,
            guildId: message.guildId || undefined,
            channelId: message.channelId,
            status: 'proxy_error',
            error
        });

        // Log error but don't throw - proxy failures should not crash the bot
    }
}