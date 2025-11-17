import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { MessageContextMenuCommandInteraction, MessageFlags, ModalSubmitInteraction } from 'discord.js';
import { editProxiedContextCommand, handleEditProxiedModalSubmit } from '../discord/context/editProxied';
import { proxiedMessageRepo } from '../infra/ProxiedMessageRepo';
import { editProxiedMessage } from '../app/EditProxiedMessage';
import { getChannelProxy } from '../../../adapters/discord/DiscordChannelProxy';
import { handleInteractionError } from '../../../shared/utils/errorHandling';

vi.mock('../infra/ProxiedMessageRepo', () => ({
    proxiedMessageRepo: {
        getByWebhookMessageId: vi.fn()
    }
}));

vi.mock('../app/EditProxiedMessage', () => ({
    editProxiedMessage: vi.fn()
}));

vi.mock('../../../adapters/discord/DiscordChannelProxy', () => ({
    getChannelProxy: vi.fn()
}));

vi.mock('../../../shared/utils/errorHandling', () => ({
    handleInteractionError: vi.fn()
}));

vi.mock('../../../shared/utils/logger', () => {
    const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        child: vi.fn().mockReturnThis()
    };
    return {
        log: mockLogger,
        default: mockLogger
    };
});

const baseRecord = {
    id: 'record-1',
    userId: 'user-123',
    formId: 'form-456',
    guildId: 'guild-789',
    channelId: 'channel-321',
    webhookId: 'webhook-654',
    webhookToken: 'token-987',
    messageId: 'message-111',
    sourceMessageId: 'source-message',
    createdAt: new Date()
};

describe('editProxiedContextCommand', () => {
    let mockContextInteraction: MessageContextMenuCommandInteraction;
    let mockModalInteraction: ModalSubmitInteraction;

    beforeEach(() => {
        vi.clearAllMocks();

        mockContextInteraction = {
            id: 'interaction-ctx',
            guild: { id: 'guild-789' },
            channel: {
                id: 'channel-321',
                isTextBased: () => true,
                messages: {
                    fetch: vi.fn()
                }
            },
            targetMessage: {
                id: 'message-111',
                content: 'Original proxied content'
            },
            user: { id: 'user-123' },
            reply: vi.fn(),
            showModal: vi.fn()
        } as unknown as MessageContextMenuCommandInteraction;

        mockModalInteraction = {
            id: 'interaction-modal',
            customId: 'edit_proxied:message-111',
            user: { id: 'user-123' },
            guild: { id: 'guild-789' },
            channel: {
                id: 'channel-321',
                isTextBased: () => true,
                messages: {
                    fetch: vi.fn()
                }
            },
            deferReply: vi.fn().mockResolvedValue(undefined),
            editReply: vi.fn(),
            deleteReply: vi.fn().mockResolvedValue(undefined),
            fields: {
                getTextInputValue: vi.fn()
            }
        } as unknown as ModalSubmitInteraction;
    });

    describe('execute', () => {
        it('shows edit modal when message is proxied and owned', async () => {
            vi.mocked(proxiedMessageRepo.getByWebhookMessageId).mockResolvedValue(baseRecord as any);

            await editProxiedContextCommand.execute(mockContextInteraction);

            expect(proxiedMessageRepo.getByWebhookMessageId).toHaveBeenCalledWith('message-111');
            expect(mockContextInteraction.showModal).toHaveBeenCalled();
        });

        it('replies when message not found in repo', async () => {
            vi.mocked(proxiedMessageRepo.getByWebhookMessageId).mockResolvedValue(null);

            await editProxiedContextCommand.execute(mockContextInteraction);

            expect(mockContextInteraction.reply).toHaveBeenCalledWith({
                content: '❌ This message was not proxied by Shapeshift or the log has expired.',
                flags: MessageFlags.Ephemeral,
                allowedMentions: expect.any(Object)
            });
            expect(mockContextInteraction.showModal).not.toHaveBeenCalled();
        });

        it('replies when user does not own the message', async () => {
            vi.mocked(proxiedMessageRepo.getByWebhookMessageId).mockResolvedValue({
                ...baseRecord,
                userId: 'different-user'
            } as any);

            await editProxiedContextCommand.execute(mockContextInteraction);

            expect(mockContextInteraction.reply).toHaveBeenCalledWith({
                content: '❌ You can only edit messages that you proxied.',
                flags: MessageFlags.Ephemeral,
                allowedMentions: expect.any(Object)
            });
        });
    });

    describe('handleEditProxiedModalSubmit', () => {
        it('edits the proxied message when validation passes', async () => {
            vi.mocked(proxiedMessageRepo.getByWebhookMessageId).mockResolvedValue(baseRecord as any);
            (mockModalInteraction.fields.getTextInputValue as Mock).mockReturnValue('Updated content');
            (mockModalInteraction.channel!.messages.fetch as Mock).mockResolvedValue({
                id: 'message-111',
                attachments: {
                    size: 1,
                    values: () => {
                        const arr = [{
                            id: 'att-1',
                            url: 'https://cdn.discordapp.com/file.png',
                            name: 'file.png',
                            size: 1024
                        }];
                        return arr[Symbol.iterator]();
                    }
                }
            });
            vi.mocked(getChannelProxy).mockReturnValue({} as any);
            vi.mocked(editProxiedMessage).mockResolvedValue();

            await handleEditProxiedModalSubmit(mockModalInteraction);

            expect(mockModalInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
            expect(proxiedMessageRepo.getByWebhookMessageId).toHaveBeenCalledWith('message-111');
            expect(editProxiedMessage).toHaveBeenCalledWith(
                {
                    record: baseRecord,
                    userId: 'user-123',
                    content: 'Updated content',
                    attachments: [
                        {
                            id: 'att-1',
                            url: 'https://cdn.discordapp.com/file.png',
                            name: 'file.png',
                            size: 1024
                        }
                    ]
                },
                expect.anything()
            );
            expect(mockModalInteraction.deleteReply).toHaveBeenCalled();
        });

        it('handles missing record via interaction error handler', async () => {
            vi.mocked(proxiedMessageRepo.getByWebhookMessageId).mockResolvedValue(null);
            (mockModalInteraction.fields.getTextInputValue as Mock).mockReturnValue('Updated content');

            await handleEditProxiedModalSubmit(mockModalInteraction);

            expect(handleInteractionError).toHaveBeenCalledWith(
                mockModalInteraction,
                expect.any(Error),
                expect.objectContaining({
                    component: 'proxy-context',
                    userId: 'user-123',
                    interactionId: mockModalInteraction.id
                }),
                expect.stringContaining('not proxied'),
                expect.objectContaining({ preferFollowUp: true })
            );
        });
    });
});
