import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageContextMenuCommandInteraction, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder } from 'discord.js';
import { context } from '../../src/discord/contexts/proxyAs';
import { MemberService } from '../../src/discord/services/MemberService';

// Mock MemberService
vi.mock('../../src/discord/services/MemberService', () => ({
    MemberService: class {
        getMembers = vi.fn();
    },
}));

describe('"Proxy as..." context menu', () => {
    let mockInteraction: MessageContextMenuCommandInteraction;
    let mockMemberService: any;
    let mockTargetMessage: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockMemberService = new MemberService();
        (MemberService as any).mockClear();

        mockTargetMessage = {
            id: 'message123',
            author: { id: 'user123' },
            content: 'test content',
            attachments: [],
        };

        mockInteraction = {
            targetMessage: mockTargetMessage,
            user: { id: 'user123' },
            reply: vi.fn().mockResolvedValue(undefined),
            showModal: vi.fn(),
            fetchReply: vi.fn(),
        } as any;
    });

    it('should reply with error when user does not own the message', async () => {
        mockTargetMessage.author.id = 'differentUser';

        await context.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: 'You can only proxy your own messages.',
            ephemeral: true,
        });
    });

    it('should show modal when user has no members', async () => {
        mockMemberService.getMembers.mockResolvedValue([]);

        await context.execute(mockInteraction);

        expect(mockInteraction.showModal).toHaveBeenCalled();
        const modal = mockInteraction.showModal.mock.calls[0][0] as ModalBuilder;
        expect(modal.data.custom_id).toBe('proxy_as_create_member:message123');
        expect(modal.data.title).toBe('Create Member');
    });

    it('should show member selector when user has members', async () => {
        const members = [
            { id: 1, name: 'Member1' },
            { id: 2, name: 'Member2' },
        ];
        mockMemberService.getMembers.mockResolvedValue(members);

        const mockReplyMessage = {
            createMessageComponentCollector: vi.fn().mockReturnValue({
                on: vi.fn(),
            }),
        };
        mockInteraction.fetchReply.mockResolvedValue(mockReplyMessage);

        await context.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            components: expect.any(Array),
            ephemeral: true,
        });

        const components = (mockInteraction.reply as any).mock.calls[0][0].components;
        expect(components).toHaveLength(1);
        const row = components[0] as ActionRowBuilder<StringSelectMenuBuilder>;
        const select = row.data.components[0] as StringSelectMenuBuilder;
        expect(select.data.custom_id).toBe('proxy_as_select_member:message123');
        expect(select.data.placeholder).toBe('Select member to proxy as');
        expect(select.data.options).toEqual([
            { label: 'Member1', value: '1' },
            { label: 'Member2', value: '2' },
        ]);
    });

    it('should set up collector for member selection', async () => {
        const members = [{ id: 1, name: 'Member1' }];
        mockMemberService.getMembers.mockResolvedValue(members);

        const mockCollector = {
            on: vi.fn(),
        };
        const mockReplyMessage = {
            createMessageComponentCollector: vi.fn().mockReturnValue(mockCollector),
        };
        mockInteraction.fetchReply.mockResolvedValue(mockReplyMessage);

        await context.execute(mockInteraction);

        expect(mockReplyMessage.createMessageComponentCollector).toHaveBeenCalledWith({ time: 60000 });
        expect(mockCollector.on).toHaveBeenCalledWith('collect', expect.any(Function));
        expect(mockCollector.on).toHaveBeenCalledWith('end', expect.any(Function));
    });
});