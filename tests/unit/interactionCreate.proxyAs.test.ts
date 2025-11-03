import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StringSelectMenuInteraction, ModalSubmitInteraction, GuildTextBasedChannel, GuildMember } from 'discord.js';
import { registerInteractionListener } from '../../src/discord/listeners/interactionCreate';
import { MemberService } from '../../src/discord/services/MemberService';
import { ProxyService } from '../../src/discord/services/ProxyService';
import { permissionGuard } from '../../src/discord/middleware/permissionGuard';

// Mock services
vi.mock('../../src/discord/services/MemberService', () => ({
    MemberService: class {
        addMember = vi.fn();
    },
}));

vi.mock('../../src/discord/services/ProxyService', () => ({
    ProxyService: class {
        sendProxied = vi.fn();
    },
}));

vi.mock('../../src/discord/middleware/permissionGuard', () => ({
    permissionGuard: vi.fn(),
}));

// Mock loaders
vi.mock('../../src/discord/commands/_loader', () => ({
    loadSlashCommands: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('../../src/discord/contexts/_loader', () => ({
    loadMessageContextCommands: vi.fn().mockResolvedValue(new Map()),
}));

describe('interactionCreate - Proxy As functionality', () => {
    let mockClient: any;
    let mockMemberService: any;
    let mockProxyService: any;
    let mockChannel: GuildTextBasedChannel;
    let mockGuildMember: GuildMember;
    let mockTargetMessage: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockMemberService = new MemberService();
        mockProxyService = new ProxyService();
        (MemberService as any).mockClear();
        (ProxyService as any).mockClear();

        mockChannel = {
            id: 'channel123',
            isTextBased: vi.fn().mockReturnValue(true),
            isDMBased: vi.fn().mockReturnValue(false),
            messages: {
                fetch: vi.fn(),
            },
        } as any;

        mockGuildMember = {
            id: 'user123',
        } as any;

        mockTargetMessage = {
            id: 'message123',
            author: { id: 'user123' },
            content: 'test content',
            attachments: [],
            delete: vi.fn(),
        };

        mockClient = {
            on: vi.fn(),
        };
    });

    describe('StringSelectMenu - proxy_as_select_member', () => {
        let mockInteraction: StringSelectMenuInteraction;

        beforeEach(() => {
            mockInteraction = {
                customId: 'proxy_as_select_member:message123',
                values: ['1'],
                channel: mockChannel,
                guild: {
                    members: {
                        fetch: vi.fn(),
                    },
                },
                user: { id: 'user123' },
                update: vi.fn(),
                editReply: vi.fn(),
            } as any;
        });

        it('should update with error for invalid channel', async () => {
            mockChannel.isTextBased.mockReturnValue(false);

            await registerInteractionListener(mockClient);
            const handler = mockClient.on.mock.calls[0][1];
            await handler(mockInteraction);

            expect(mockInteraction.update).toHaveBeenCalledWith({
                content: 'Invalid channel.',
                components: [],
            });
        });

        it('should update with error for DM channel', async () => {
            mockChannel.isDMBased.mockReturnValue(true);

            await registerInteractionListener(mockClient);
            const handler = mockClient.on.mock.calls[0][1];
            await handler(mockInteraction);

            expect(mockInteraction.update).toHaveBeenCalledWith({
                content: 'Invalid channel.',
                components: [],
            });
        });

        it('should update with error when message not found', async () => {
            mockChannel.messages.fetch.mockResolvedValue(null);

            await registerInteractionListener(mockClient);
            const handler = mockClient.on.mock.calls[0][1];
            await handler(mockInteraction);

            expect(mockInteraction.update).toHaveBeenCalledWith({
                content: 'Message not found.',
                components: [],
            });
        });

        it('should edit reply with error when permission guard fails', async () => {
            mockChannel.messages.fetch.mockResolvedValue(mockTargetMessage);
            mockInteraction.guild!.members.fetch.mockResolvedValue(mockGuildMember);
            vi.mocked(permissionGuard).mockReturnValue(null);

            await registerInteractionListener(mockClient);
            const handler = mockClient.on.mock.calls[0][1];
            await handler(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: 'Insufficient permissions.',
                components: [],
            });
        });

        it('should successfully proxy message and delete original', async () => {
            mockChannel.messages.fetch.mockResolvedValue(mockTargetMessage);
            mockInteraction.guild!.members.fetch.mockResolvedValue(mockGuildMember);
            vi.mocked(permissionGuard).mockReturnValue({
                allowedMentions: { parse: ['users'] },
                files: [],
                flags: 4,
            });
            mockProxyService.sendProxied.mockResolvedValue({
                channelId: 'channel123',
                messageId: 'proxied123',
            });

            await registerInteractionListener(mockClient);
            const handler = mockClient.on.mock.calls[0][1];
            await handler(mockInteraction);

            expect(mockProxyService.sendProxied).toHaveBeenCalledWith({
                actorUserId: 'user123',
                memberId: 1,
                channel: mockChannel,
                content: 'test content',
                attachments: [],
                originalMessageId: 'message123',
            });

            expect(mockTargetMessage.delete).toHaveBeenCalled();
            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: 'Message proxied successfully.',
                components: [],
            });
        });

        it('should handle proxy service errors', async () => {
            mockChannel.messages.fetch.mockResolvedValue(mockTargetMessage);
            mockInteraction.guild!.members.fetch.mockResolvedValue(mockGuildMember);
            vi.mocked(permissionGuard).mockReturnValue({
                allowedMentions: { parse: ['users'] },
                files: [],
                flags: 4,
            });
            mockProxyService.sendProxied.mockRejectedValue(new Error('Proxy failed'));

            await registerInteractionListener(mockClient);
            const handler = mockClient.on.mock.calls[0][1];
            await handler(mockInteraction);

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: 'Error: Proxy failed',
                components: [],
            });
        });
    });

    describe('ModalSubmit - proxy_as_create_member', () => {
        let mockInteraction: ModalSubmitInteraction;

        beforeEach(() => {
            mockInteraction = {
                customId: 'proxy_as_create_member:message123',
                fields: {
                    getTextInputValue: vi.fn().mockReturnValue('NewMember'),
                },
                channel: mockChannel,
                guild: {
                    members: {
                        fetch: vi.fn(),
                    },
                },
                user: { id: 'user123' },
                reply: vi.fn(),
            } as any;
        });

        it('should reply with error for invalid channel', async () => {
            mockChannel.isTextBased.mockReturnValue(false);

            await registerInteractionListener(mockClient);
            const handler = mockClient.on.mock.calls[0][1];
            await handler(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: 'Invalid channel.',
                ephemeral: true,
            });
        });

        it('should reply with error when message not found', async () => {
            mockChannel.messages.fetch.mockResolvedValue(null);

            await registerInteractionListener(mockClient);
            const handler = mockClient.on.mock.calls[0][1];
            await handler(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: 'Message not found.',
                ephemeral: true,
            });
        });

        it('should create member, proxy message, and delete original', async () => {
            mockChannel.messages.fetch.mockResolvedValue(mockTargetMessage);
            mockInteraction.guild!.members.fetch.mockResolvedValue(mockGuildMember);
            vi.mocked(permissionGuard).mockReturnValue({
                allowedMentions: { parse: ['users'] },
                files: [],
                flags: 4,
            });
            mockMemberService.addMember.mockResolvedValue({ id: 1, name: 'NewMember' });
            mockProxyService.sendProxied.mockResolvedValue({
                channelId: 'channel123',
                messageId: 'proxied123',
            });

            await registerInteractionListener(mockClient);
            const handler = mockClient.on.mock.calls[0][1];
            await handler(mockInteraction);

            expect(mockMemberService.addMember).toHaveBeenCalledWith('user123', 'NewMember');
            expect(mockProxyService.sendProxied).toHaveBeenCalledWith({
                actorUserId: 'user123',
                memberId: 1,
                channel: mockChannel,
                content: 'test content',
                attachments: [],
                originalMessageId: 'message123',
            });

            expect(mockTargetMessage.delete).toHaveBeenCalled();
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: 'Member created and message proxied successfully.',
                ephemeral: true,
            });
        });

        it('should handle member creation errors', async () => {
            mockChannel.messages.fetch.mockResolvedValue(mockTargetMessage);
            mockMemberService.addMember.mockRejectedValue(new Error('Member creation failed'));

            await registerInteractionListener(mockClient);
            const handler = mockClient.on.mock.calls[0][1];
            await handler(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: 'Error: Member creation failed',
                ephemeral: true,
            });
        });
    });
});