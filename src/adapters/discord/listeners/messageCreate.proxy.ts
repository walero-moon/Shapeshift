import { Message, TextChannel } from 'discord.js';
import { performance } from 'node:perf_hooks';
import { matchAlias } from '../../../features/proxy/app/MatchAlias';
import { validateUserChannelPerms } from '../../../features/proxy/app/ValidateUserChannelPerms';
import { proxyCoordinator } from '../../../features/proxy/app/ProxyCoordinator';
import { formRepo } from '../../../features/identity/infra/FormRepo';
import { getAutoproxyState } from '../../../features/proxy/app/autoproxy/GetAutoproxyState';
import { DiscordChannelProxy } from '../DiscordChannelProxy';
import { client } from '../client';
import { log } from '../../../shared/utils/logger';
import { handleDegradedModeError } from '../../../shared/utils/errorHandling';
import { reuploadAttachments, splitAttachmentsBySize } from '../../../shared/utils/attachments';

/**
 * Message create listener for tag-based proxying
 * Listens for guild text messages that match user aliases and proxies them as forms
 */
export async function messageCreateProxy(message: Message) {
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
        log.debug('Skipping bot message', {
            component: 'proxy',
            userId: message.author.id,
            status: 'skipped_bot'
        });
        return;
    }

    // Skip messages without content
    if (!message.content) {
        log.debug('Skipping message without content', {
            component: 'proxy',
            userId: message.author.id,
            status: 'skipped_no_content'
        });
        return;
    }

    // Ignore DMs - only process guild messages
    if (!message.guildId) {
        log.debug('Skipping DM message', {
            component: 'proxy',
            userId: message.author.id,
            status: 'skipped_dm'
        });
        return;
    }

    log.debug('Processing guild message for proxying', {
        component: 'proxy',
        userId: message.author.id,
        guildId: message.guildId || undefined,
        channelId: message.channelId,
        contentLength: message.content.length,
        status: 'processing'
    });

    const proxyStart = performance.now();
    try {
        // Parallelize independent fetches: match, form, member, attachments, reply
        const parallelStart = performance.now();
        const promises: Promise<{ type: string; value: any }>[] = [];

        const matchPromise = handleDegradedModeError(
            () => matchAlias(message.author.id, message.content),
            {
                component: 'proxy',
                userId: message.author.id,
                guildId: message.guildId || undefined,
                channelId: message.channelId,
                status: 'degraded_mode_fallback'
            },
            null,
            'Failed to match alias'
        );

        // Match alias
        promises.push(matchPromise.then(match => ({ type: 'match', value: match })));

        // Form fetch (will be resolved after match)
        promises.push(
            matchPromise.then(async (match) => {
                if (match) {
                    return handleDegradedModeError(
                        () => formRepo.getCachedByUserAndId(message.author.id, match.alias.formId),
                        {
                            component: 'proxy',
                            userId: message.author.id,
                            guildId: message.guildId || undefined,
                            channelId: message.channelId,
                            status: 'degraded_mode_fallback'
                        },
                        null,
                        'Failed to fetch form'
                    );
                }
                return null;
            }).then(form => ({ type: 'form', value: form }))
        );

        // Member fetch
        promises.push(
            handleDegradedModeError(
                () => message.guild!.members.fetch(message.author.id),
                {
                    component: 'proxy',
                    userId: message.author.id,
                    guildId: message.guildId || undefined,
                    channelId: message.channelId,
                    status: 'degraded_mode_fallback'
                },
                null,
                'Failed to fetch member'
            ).then(member => ({ type: 'member', value: member }))
        );

        // Collect Discord.js attachments
        const discordAttachments = Array.from(message.attachments.values());

        if (discordAttachments.length > 0) {
            // Split attachments by size for follow-up edits optimization
            const { small, large } = splitAttachmentsBySize(
                discordAttachments.map(attachment => ({
                    name: attachment.name,
                    url: attachment.url,
                    id: attachment.id,
                    size: attachment.size
                }))
            );

            log.debug('Attachment size analysis in listener', {
                component: 'proxy',
                userId: message.author.id,
                guildId: message.guildId || undefined,
                channelId: message.channelId,
                totalAttachments: discordAttachments.length,
                smallAttachments: small.length,
                largeAttachments: large.length,
                status: 'attachment_analysis_listener'
            });

            // Reupload only small attachments initially
            if (small.length > 0) {
                promises.push(
                    handleDegradedModeError(
                        () => reuploadAttachments(small),
                        {
                            component: 'proxy',
                            userId: message.author.id,
                            guildId: message.guildId || undefined,
                            channelId: message.channelId,
                            status: 'degraded_mode_fallback'
                        },
                        [],
                        'Failed to reupload small attachments'
                    ).then(attachments => ({ type: 'attachments', value: attachments }))
                );
            }

            // Store large attachments for follow-up processing
            if (large.length > 0) {
                promises.push(Promise.resolve({ type: 'largeAttachments', value: large }));
            }
        }

        // Reply fetch if reference exists
        if (message.reference && message.reference.guildId && message.reference.channelId && message.reference.messageId) {
            promises.push(
                handleDegradedModeError(
                    async () => {
                        const channel = await client.channels.fetch(message.reference!.channelId!);
                        if (!channel?.isTextBased()) throw new Error('Channel not found or not text-based');
                        return await channel.messages.fetch(message.reference!.messageId!);
                    },
                    {
                        component: 'proxy',
                        userId: message.author.id,
                        guildId: message.guildId || undefined,
                        channelId: message.channelId,
                        status: 'degraded_mode_fallback'
                    },
                    null,
                    'Failed to fetch reply message'
                ).then(replyMessage => ({ type: 'reply', value: replyMessage }))
            );
        }

        const results = await Promise.allSettled(promises);
        const parallelDuration = performance.now() - parallelStart;
        log.debug('Proxy stage complete', {
            stage: 'parallelFetches',
            durationMs: parallelDuration,
            component: 'proxy',
            userId: message.author.id,
            guildId: message.guildId || undefined,
            channelId: message.channelId
        });

        // Extract results
        let match = null;
        let form = null;
        let member = null;
        let standardizedAttachments: any[] = [];
        let largeAttachments: any[] = [];
        let replyMessage = null;
        for (const result of results) {
            if (result.status === 'fulfilled') {
                const { type, value } = result.value;
                if (type === 'match') match = value;
                else if (type === 'form') form = value;
                else if (type === 'member') member = value;
                else if (type === 'attachments') standardizedAttachments = value;
                else if (type === 'largeAttachments') largeAttachments = value;
                else if (type === 'reply') replyMessage = value;
            }
        }

        let proxySource: 'alias' | 'autoproxy' | null = null;
        let proxyContent: string | null = null;
        let activeAutoproxyState: Awaited<ReturnType<typeof getAutoproxyState>>['state'] | null = null;

        if (match) {
            proxySource = 'alias';
            proxyContent = match.renderedText;

            const aliasMatchDuration = performance.now() - proxyStart;
            log.debug('Proxy stage complete', {
                stage: 'aliasMatch',
                durationMs: aliasMatchDuration,
                component: 'proxy',
                userId: message.author.id,
                guildId: message.guildId || undefined,
                channelId: message.channelId
            });

            log.debug('Alias matching result', {
                component: 'proxy',
                userId: message.author.id,
                contentLength: message.content.length,
                matchFound: true,
                aliasId: match.alias.id,
                renderedTextLength: match.renderedText.length,
                status: 'match_found'
            });
        }

        if (!match) {
            const autoproxyResult = await getAutoproxyState({
                userId: message.author.id,
                guildId: message.guildId,
                channelId: message.channelId
            });

            activeAutoproxyState = autoproxyResult.state;

            if (!activeAutoproxyState) {
                log.debug('No alias or autoproxy match found, skipping proxy', {
                    component: 'proxy',
                    userId: message.author.id,
                    status: 'skipped_no_match'
                });
                return;
            }

            const autoproxyFormId = activeAutoproxyState.mode === 'form'
                ? activeAutoproxyState.formId
                : activeAutoproxyState.lastFormId;

            if (!autoproxyFormId) {
                log.info('Autoproxy state pending latch', {
                    component: 'proxy',
                    userId: message.author.id,
                    guildId: message.guildId || undefined,
                    channelId: message.channelId,
                    mode: activeAutoproxyState.mode,
                    status: 'autoproxy_pending'
                });
                return;
            }

            form = await formRepo.getCachedByUserAndId(message.author.id, autoproxyFormId);
            if (!form) {
                log.warn('Autoproxy form not found', {
                    component: 'proxy',
                    userId: message.author.id,
                    guildId: message.guildId || undefined,
                    channelId: message.channelId,
                    formId: autoproxyFormId,
                    status: 'autoproxy_form_missing'
                });
                return;
            }

            proxySource = 'autoproxy';
            proxyContent = message.content;

            log.info('Autoproxy state hit', {
                component: 'proxy',
                userId: message.author.id,
                guildId: message.guildId || undefined,
                channelId: message.channelId,
                mode: activeAutoproxyState.mode,
                stateId: activeAutoproxyState.id,
                status: 'autoproxy_hit'
            });
        }

        if (!form) {
            log.warn(proxySource === 'autoproxy' ? 'Autoproxy form not found' : 'Form not found after parallel fetch', {
                component: 'proxy',
                userId: message.author.id,
                guildId: message.guildId || undefined,
                channelId: message.channelId,
                aliasId: match?.alias.id,
                formId: match?.alias.formId,
                status: 'form_not_found'
            });
            return;
        }

        if (!member) {
            log.warn('Member not found after parallel fetch', {
                component: 'proxy',
                userId: message.author.id,
                status: 'member_not_found'
            });
            return;
        }

        // Validate user permissions in the channel
        const permsStart = performance.now();
        const hasPerms = await validateUserChannelPerms(
            message.author.id,
            message.channel as TextChannel,
            Array.from(message.attachments.values()),
            member
        );
        const permsDuration = performance.now() - permsStart;
        log.debug('Proxy stage complete', {
            stage: 'permsCheck',
            durationMs: permsDuration,
            component: 'proxy',
            userId: message.author.id,
            guildId: message.guildId || undefined,
            channelId: message.channelId
        });

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

        // Create channel proxy instance
        const channelProxy = new DiscordChannelProxy(message.channelId);

        // Check for reply context
        const replyFetchStart = performance.now();
        let replyTo: { guildId: string; channelId: string; messageId: string } | undefined;
        if (message.reference && message.reference.guildId && message.reference.channelId && message.reference.messageId) {
            replyTo = {
                guildId: message.reference.guildId,
                channelId: message.reference.channelId,
                messageId: message.reference.messageId
            };
            log.debug('Reply context detected', {
                component: 'proxy',
                userId: message.author.id,
                replyTo,
                status: 'reply_context_detected'
            });
        } else {
            log.debug('No reply context', {
                component: 'proxy',
                userId: message.author.id,
                status: 'no_reply_context'
            });
        }
        const replyFetchDuration = performance.now() - replyFetchStart;
        log.debug('Proxy stage complete', {
            stage: 'replyFetch',
            durationMs: replyFetchDuration,
            component: 'proxy',
            userId: message.author.id,
            guildId: message.guildId || undefined,
            channelId: message.channelId
        });

        // Proxy the message via coordinator with standardized attachments
        const proxySendStart = performance.now();
        const messageBody = proxyContent ?? (match ? match.renderedText : message.content);

        const proxyResult = await proxyCoordinator(
            message.author.id,
            form.id,
            message.channelId,
            message.guildId,
            messageBody,
            channelProxy,
            standardizedAttachments,
            replyTo,
            form,
            replyMessage,
            message.id,
            { recordLatch: proxySource === 'alias' }
        );
        const proxySendDuration = performance.now() - proxySendStart;
        log.debug('Proxy stage complete', {
            stage: 'proxySend',
            durationMs: proxySendDuration,
            component: 'proxy',
            userId: message.author.id,
            guildId: message.guildId || undefined,
            channelId: message.channelId
        });

        // (Latch recording handled in proxyCoordinator when recordLatch option is enabled)

        // Handle large attachments with follow-up edits
        if (largeAttachments.length > 0) {
            log.info('Processing large attachments with follow-up edits', {
                component: 'proxy',
                userId: message.author.id,
                guildId: message.guildId || undefined,
                channelId: message.channelId,
                messageId: proxyResult.messageId,
                largeAttachmentCount: largeAttachments.length,
                status: 'follow_up_edits_start'
            });

            // Upload large attachments in parallel and edit the message (fire-and-forget)
            void handleDegradedModeError(async () => {
                const startTime = Date.now();
                const { reuploadAttachments } = await import('../../../shared/utils/attachments');
                const largeAttachmentBuffers = await reuploadAttachments(largeAttachments);

                if (largeAttachmentBuffers.length > 0) {
                    const editData = {
                        content: messageBody, // Use the rendered text content
                        attachments: [...standardizedAttachments, ...largeAttachmentBuffers],
                        allowedMentions: { parse: [] } // Default to no pings
                    };

                    await channelProxy.edit(proxyResult.webhookId, proxyResult.token, proxyResult.messageId, editData);

                    log.info('Large attachments added via follow-up edit', {
                        component: 'proxy',
                        userId: message.author.id,
                        guildId: message.guildId || undefined,
                        channelId: message.channelId,
                        messageId: proxyResult.messageId,
                        largeAttachmentsAdded: largeAttachmentBuffers.length,
                        durationMs: Date.now() - startTime,
                        status: 'follow_up_edits_success'
                    });
                }
            }, {
                component: 'proxy',
                userId: message.author.id,
                guildId: message.guildId || undefined,
                channelId: message.channelId,
                messageId: proxyResult.messageId
            }, undefined, 'follow_up_attachment_edits');
        }

        log.info(proxySource === 'autoproxy' ? 'Message proxied via autoproxy' : 'Message proxied successfully via tag', {
            component: 'proxy',
            userId: message.author.id,
            formId: form.id,
            aliasId: match?.alias.id,
            autoproxyStateId: activeAutoproxyState?.id,
            autoproxyMode: activeAutoproxyState?.mode,
            guildId: message.guildId || undefined,
            channelId: message.channelId,
            status: 'proxy_success'
        });

        // Delete the original user message after successful proxying (fire-and-forget)
        void handleDegradedModeError(() => message.delete(), {
            component: 'proxy',
            userId: message.author.id,
            guildId: message.guildId || undefined,
            channelId: message.channelId,
            status: 'degraded_mode_fallback'
        }, undefined, 'delete proxied source');

        // Log total proxy operation duration
        const totalDuration = performance.now() - proxyStart;
        log.info('Proxy operation completed successfully', {
            component: 'proxy',
            userId: message.author.id,
            guildId: message.guildId || undefined,
            channelId: message.channelId,
            durationMs: totalDuration,
            status: 'proxy_complete'
        });

    } catch (error) {
        const totalDuration = performance.now() - proxyStart;
        log.error('Failed to proxy message via tag', {
            component: 'proxy',
            userId: message.author.id,
            guildId: message.guildId,
            channelId: message.channelId,
            durationMs: totalDuration,
            status: 'proxy_error',
            error
        });

        // Log error but don't throw - proxy failures should not crash the bot
    }
}
