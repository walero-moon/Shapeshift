import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageContextMenuCommandInteraction, MessageFlags } from 'discord.js';
import { whoSentThisContextCommand } from '../discord/context/whoSentThis';
import { getProxiedMessageDetails } from '../app/GetProxiedMessageDetails';
import { handleInteractionError } from '../../../shared/utils/errorHandling';

vi.mock('../app/GetProxiedMessageDetails');
vi.mock('../../../shared/utils/errorHandling', () => ({
    handleInteractionError: vi.fn()
}));

const baseDetails = {
    id: 'record-1',
    userId: 'user-123',
    formId: 'form-456',
    guildId: 'guild-789',
    channelId: 'channel-111',
    webhookId: 'webhook-222',
    webhookToken: 'token-333',
    messageId: 'message-444',
    sourceMessageId: 'source-555',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    formName: 'Test Form',
    formAvatarUrl: 'https://example.com/avatar.png'
};

describe('whoSentThisContextCommand', () => {
    let interaction: MessageContextMenuCommandInteraction;

    beforeEach(() => {
        vi.clearAllMocks();

        interaction = {
            id: 'interaction-1',
            user: { id: 'requester-1' },
            guild: { id: 'guild-789' },
            channel: {
                id: 'channel-111',
                isTextBased: () => true
            },
            targetMessage: {
                id: 'message-444'
            },
            reply: vi.fn(),
            deferReply: vi.fn().mockResolvedValue(undefined),
            editReply: vi.fn().mockResolvedValue(undefined)
        } as unknown as MessageContextMenuCommandInteraction;
    });

    it('replies with warning if not in guild text channel', async () => {
        interaction = {
            ...interaction,
            guild: null
        } as unknown as MessageContextMenuCommandInteraction;

        await whoSentThisContextCommand.execute(interaction);

        expect(interaction.reply).toHaveBeenCalledWith({
            content: '❌ This context menu can only be used inside guild text channels.',
            flags: MessageFlags.Ephemeral,
            allowedMentions: expect.any(Object)
        });
    });

    it('returns proxied message details', async () => {
        vi.mocked(getProxiedMessageDetails).mockResolvedValue(baseDetails as any);

        await whoSentThisContextCommand.execute(interaction);

        expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
        expect(getProxiedMessageDetails).toHaveBeenCalledWith('message-444');
        expect(interaction.editReply).toHaveBeenCalledWith({
            embeds: expect.any(Array),
            allowedMentions: expect.any(Object)
        });
    });

    it('handles missing record by sending message', async () => {
        vi.mocked(getProxiedMessageDetails).mockRejectedValue(new Error('Not tracked'));

        await whoSentThisContextCommand.execute(interaction);

        expect(interaction.editReply).toHaveBeenCalledWith({
            content: 'Not tracked',
            allowedMentions: expect.any(Object)
        });
    });

    it('handles interaction errors gracefully', async () => {
        interaction.deferReply = vi.fn().mockRejectedValue(new Error('defer failure'));

        await whoSentThisContextCommand.execute(interaction);

        expect(handleInteractionError).toHaveBeenCalled();
    });
});
