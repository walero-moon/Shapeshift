import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { MessageContextMenuCommandInteraction, MessageFlags, ModalSubmitInteraction } from 'discord.js';
import { proxyAsContextCommand, handleProxyAsModalSubmit } from '../discord/context/proxyAs';
import { listForms } from '../../identity/app/ListForms';
import { proxyMessageContext } from '../app/ProxyMessageContext';
import { getChannelProxy } from '../../../adapters/discord/DiscordChannelProxy';
import { handleInteractionError } from '../../../shared/utils/errorHandling';

// Mock dependencies
vi.mock('../../identity/app/ListForms');
vi.mock('../app/ProxyMessageContext');
vi.mock('../../../adapters/discord/DiscordChannelProxy');
vi.mock('../../../shared/utils/logger');
vi.mock('../../../shared/utils/errorHandling', () => ({
    handleInteractionError: vi.fn()
}));

describe('proxyAs context command', () => {
    let mockContextInteraction: MessageContextMenuCommandInteraction;
    let mockModalInteraction: ModalSubmitInteraction;

    beforeEach(() => {
        vi.clearAllMocks();

        vi.mocked(handleInteractionError).mockReset();
        vi.mocked(handleInteractionError).mockResolvedValue(undefined as any);

        mockContextInteraction = {
            id: 'interaction-1',
            targetMessage: {
                id: 'message-123',
                content: 'Hello world',
                author: { bot: false, system: false, id: 'user-123' },
                attachments: [],
            },
            user: { id: 'user-123' },
            reply: vi.fn(),
            showModal: vi.fn(),
            channel: {
                id: 'channel-456',
                isTextBased: () => true,
                messages: {
                    fetch: vi.fn()
                }
            },
            guild: { id: 'guild-123' }
        } as any;

        mockModalInteraction = {
            id: 'interaction-1',
            customId: 'proxy_as:message-123',
            user: { id: 'user-123' },
            fields: {
                getTextInputValue: vi.fn()
            },
            deferReply: vi.fn(),
            editReply: vi.fn(),
            channel: {
                id: 'channel-456',
                isTextBased: () => true,
                messages: {
                    fetch: vi.fn()
                }
            },
            guild: { id: 'guild-123' }
        } as unknown as ModalSubmitInteraction;
    });

    describe('execute', () => {
        it('should show modal for valid user message', async () => {
            const mockForms = [
                {
                    id: 'form-1',
                    name: 'Test Form',
                    avatarUrl: null,
                    createdAt: new Date(),
                    aliases: []
                }
            ];

            vi.mocked(listForms).mockResolvedValue(mockForms);

            await proxyAsContextCommand.execute(mockContextInteraction);

            expect(listForms).toHaveBeenCalledWith('user-123');
            expect(mockContextInteraction.showModal).toHaveBeenCalled();
        });

        it('should reject bot messages', async () => {
            mockContextInteraction.targetMessage.author.bot = true;

            await proxyAsContextCommand.execute(mockContextInteraction);

            expect(mockContextInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Cannot proxy bot or system messages.',
                flags: MessageFlags.Ephemeral,
                allowedMentions: expect.any(Object)
            });
            expect(mockContextInteraction.showModal).not.toHaveBeenCalled();
        });

        it('should reject system messages', async () => {
            mockContextInteraction.targetMessage.author.system = true;

            await proxyAsContextCommand.execute(mockContextInteraction);

            expect(mockContextInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Cannot proxy bot or system messages.',
                flags: MessageFlags.Ephemeral,
                allowedMentions: expect.any(Object)
            });
        });

        it('should handle users with no forms', async () => {
            vi.mocked(listForms).mockResolvedValue([]);

            await proxyAsContextCommand.execute(mockContextInteraction);

            expect(mockContextInteraction.reply).toHaveBeenCalledWith({
                content: '❌ You have no forms to proxy as. Create a form first with `/form add`.',
                flags: MessageFlags.Ephemeral,
                allowedMentions: expect.any(Object)
            });
        });

        it('should reject messages not owned by the invoking user', async () => {
            mockContextInteraction.targetMessage.author.id = 'another-user';

            await proxyAsContextCommand.execute(mockContextInteraction);

            expect(mockContextInteraction.reply).toHaveBeenCalledWith({
                content: '❌ You can only proxy messages you originally sent.',
                flags: MessageFlags.Ephemeral,
                allowedMentions: expect.any(Object)
            });
            expect(mockContextInteraction.showModal).not.toHaveBeenCalled();
        });
    });

    describe('handleProxyAsModalSubmit', () => {
        it('should successfully proxy message', async () => {
            const mockForms = [
                {
                    id: 'form-1',
                    name: 'Test Form',
                    avatarUrl: null,
                    createdAt: new Date(),
                    aliases: []
                }
            ];

            const mockFetchedMessage = {
                id: 'message-123',
                content: 'Hello world',
                author: { bot: false, system: false, id: 'user-123' },
                attachments: []
            };

            const mockProxyResult = {
                webhookId: 'webhook-123',
                webhookToken: 'token-456',
                messageId: 'message-789'
            };

            vi.mocked(listForms).mockResolvedValue(mockForms);
            (mockModalInteraction.channel!.messages.fetch as Mock).mockResolvedValue(mockFetchedMessage);
            (mockModalInteraction.fields.getTextInputValue as Mock)
                .mockImplementation((field: string) => {
                    if (field === 'form_id') return 'Test Form';
                    if (field === 'delete_original') return 'no';
                    return '';
                });
            vi.mocked(getChannelProxy).mockReturnValue({} as any);
            vi.mocked(proxyMessageContext).mockResolvedValue(mockProxyResult);

            await handleProxyAsModalSubmit(mockModalInteraction);

            expect(mockModalInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
            expect(listForms).toHaveBeenCalledWith('user-123');
            expect(getChannelProxy).toHaveBeenCalledWith('channel-456');
            expect(proxyMessageContext).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'user-123',
                    formId: 'form-1',
                    sourceMessageId: 'message-123',
                    channelContext: { guildId: 'guild-123', channelId: 'channel-456' }
                }),
                expect.anything()
            );
            expect(handleInteractionError).not.toHaveBeenCalled();
            expect(mockModalInteraction.editReply).toHaveBeenCalledWith({
                content: '✅ Message proxied successfully!',
                allowedMentions: expect.any(Object)
            });
        });

        it('should handle form not found', async () => {
            const mockForms = [
                {
                    id: 'form-1',
                    name: 'Different Form',
                    avatarUrl: null,
                    createdAt: new Date(),
                    aliases: []
                }
            ];

            vi.mocked(listForms).mockResolvedValue(mockForms);
            (mockModalInteraction.channel!.messages.fetch as Mock).mockResolvedValue({
                id: 'message-123',
                content: 'Hello world',
                author: { bot: false, system: false, id: 'user-123' },
                attachments: []
            });
            (mockModalInteraction.fields.getTextInputValue as Mock)
                .mockImplementation((field: string) => {
                    if (field === 'form_id') return 'Nonexistent Form';
                    if (field === 'delete_original') return 'no';
                    return '';
                });

            await handleProxyAsModalSubmit(mockModalInteraction);

            expect(handleInteractionError).toHaveBeenCalledWith(
                mockModalInteraction,
                expect.any(Error),
                expect.objectContaining({
                    component: 'proxy-context',
                    userId: 'user-123',
                    interactionId: mockModalInteraction.id
                }),
                expect.stringContaining('Form "Nonexistent Form" not found')
            );
        });

        it('should handle delete original option', async () => {
            const mockForms = [
                {
                    id: 'form-1',
                    name: 'Test Form',
                    avatarUrl: null,
                    createdAt: new Date(),
                    aliases: []
                }
            ];

            const mockFetchedMessage = {
                id: 'message-123',
                content: 'Hello world',
                author: { bot: false, system: false, id: 'user-123' },
                attachments: [],
                delete: vi.fn()
            };

            const mockProxyResult = {
                webhookId: 'webhook-123',
                webhookToken: 'token-456',
                messageId: 'message-789'
            };

            vi.mocked(listForms).mockResolvedValue(mockForms);
            (mockModalInteraction.channel!.messages.fetch as Mock).mockResolvedValue(mockFetchedMessage);
            (mockModalInteraction.fields.getTextInputValue as Mock)
                .mockImplementation((field: string) => {
                    if (field === 'form_id') return 'Test Form';
                    if (field === 'delete_original') return 'yes';
                    return '';
                });
            vi.mocked(getChannelProxy).mockReturnValue({} as any);
            vi.mocked(proxyMessageContext).mockResolvedValue(mockProxyResult);

            await handleProxyAsModalSubmit(mockModalInteraction);

            expect(mockFetchedMessage.delete).toHaveBeenCalled();
            expect(getChannelProxy).toHaveBeenCalledWith('channel-456');
            expect(mockModalInteraction.editReply).toHaveBeenCalledWith({
                content: '✅ Message proxied successfully! Original message deleted.',
                allowedMentions: expect.any(Object)
            });
        });

        it('should handle message not found', async () => {
            (mockModalInteraction.channel!.messages.fetch as Mock).mockRejectedValue(new Error('Message not found'));
            (mockModalInteraction.fields.getTextInputValue as Mock).mockReturnValue('');

            await handleProxyAsModalSubmit(mockModalInteraction);

            expect(handleInteractionError).toHaveBeenCalledWith(
                mockModalInteraction,
                expect.any(Error),
                expect.objectContaining({
                    component: 'proxy-context',
                    userId: 'user-123',
                    interactionId: mockModalInteraction.id
                }),
                expect.stringContaining('Message not found')
            );
        });

        it('should handle proxy failure', async () => {
            const mockForms = [
                {
                    id: 'form-1',
                    name: 'Test Form',
                    avatarUrl: null,
                    createdAt: new Date(),
                    aliases: []
                }
            ];

            vi.mocked(listForms).mockResolvedValue(mockForms);
            (mockModalInteraction.channel!.messages.fetch as Mock).mockResolvedValue({
                id: 'message-123',
                content: 'Hello world',
                author: { bot: false, system: false, id: 'user-123' },
                attachments: []
            });
            (mockModalInteraction.fields.getTextInputValue as Mock)
                .mockImplementation((field: string) => {
                    if (field === 'form_id') return 'Test Form';
                    if (field === 'delete_original') return 'no';
                    return '';
                });
            vi.mocked(proxyMessageContext).mockRejectedValue(new Error('Proxy failed'));

            await handleProxyAsModalSubmit(mockModalInteraction);

            expect(handleInteractionError).toHaveBeenCalledWith(
                mockModalInteraction,
                expect.any(Error),
                expect.objectContaining({
                    component: 'proxy-context',
                    userId: 'user-123',
                    interactionId: mockModalInteraction.id
                }),
                expect.stringContaining('Proxy failed')
            );
        });

        it('should error when user does not own the fetched message', async () => {
            const mockForms = [
                { id: 'form-1', name: 'Test Form', avatarUrl: null, createdAt: new Date(), aliases: [] }
            ];

            vi.mocked(listForms).mockResolvedValue(mockForms);
            (mockModalInteraction.channel!.messages.fetch as Mock).mockResolvedValue({
                id: 'message-123',
                content: 'Hello world',
                author: { bot: false, system: false, id: 'another-user' },
                attachments: []
            });
            (mockModalInteraction.fields.getTextInputValue as Mock).mockImplementation((field: string) => {
                if (field === 'form_id') return 'Test Form';
                if (field === 'delete_original') return 'no';
                return '';
            });

            await handleProxyAsModalSubmit(mockModalInteraction);

            expect(handleInteractionError).toHaveBeenCalledWith(
                mockModalInteraction,
                expect.any(Error),
                expect.objectContaining({
                    component: 'proxy-context',
                    userId: 'user-123',
                    interactionId: mockModalInteraction.id
                }),
                expect.stringContaining('originally sent')
            );
        });
    });
});
