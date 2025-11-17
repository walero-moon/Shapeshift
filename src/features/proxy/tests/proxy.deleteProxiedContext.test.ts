import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageContextMenuCommandInteraction, MessageFlags } from 'discord.js';
import { deleteProxiedContextCommand } from '../discord/context/deleteProxied';
import { proxiedMessageRepo } from '../infra/ProxiedMessageRepo';
import { deleteProxiedMessage } from '../app/DeleteProxiedMessage';
import { getChannelProxy } from '../../../adapters/discord/DiscordChannelProxy';
import { handleInteractionError } from '../../../shared/utils/errorHandling';

vi.mock('../infra/ProxiedMessageRepo', () => ({
    proxiedMessageRepo: {
        getByWebhookMessageId: vi.fn()
    }
}));

vi.mock('../app/DeleteProxiedMessage', () => ({
    deleteProxiedMessage: vi.fn()
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
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        child: vi.fn().mockReturnThis()
    };
    return {
        log: mockLogger,
        default: mockLogger
    };
});

const record = {
    id: 'record-1',
    userId: 'user-123',
    formId: 'form-456',
    guildId: 'guild-789',
    channelId: 'channel-111',
    webhookId: 'webhook-222',
    webhookToken: 'token-333',
    messageId: 'message-444',
    sourceMessageId: 'source-555',
    createdAt: new Date()
};

describe('deleteProxiedContextCommand', () => {
    let interaction: MessageContextMenuCommandInteraction;

    beforeEach(() => {
        vi.clearAllMocks();
        interaction = {
            id: 'interaction-1',
            guild: { id: 'guild-789' },
            channel: {
                id: 'channel-111',
                isTextBased: () => true
            },
            targetMessage: {
                id: 'message-444'
            },
            user: { id: 'user-123' },
            reply: vi.fn(),
            deferReply: vi.fn().mockResolvedValue(undefined),
            editReply: vi.fn(),
            deleteReply: vi.fn().mockResolvedValue(undefined)
        } as unknown as MessageContextMenuCommandInteraction;
    });

    it('replies when message not proxied', async () => {
        vi.mocked(proxiedMessageRepo.getByWebhookMessageId).mockResolvedValue(null);

        await deleteProxiedContextCommand.execute(interaction);

        expect(interaction.reply).toHaveBeenCalledWith({
            content: '❌ This message was not proxied by Shapeshift or the log has expired.',
            flags: MessageFlags.Ephemeral,
            allowedMentions: expect.any(Object)
        });
        expect(deleteProxiedMessage).not.toHaveBeenCalled();
    });

    it('replies when user not owner', async () => {
        vi.mocked(proxiedMessageRepo.getByWebhookMessageId).mockResolvedValue({ ...record, userId: 'another' } as any);

        await deleteProxiedContextCommand.execute(interaction);

        expect(interaction.reply).toHaveBeenCalledWith({
            content: '❌ You can only delete messages that you proxied.',
            flags: MessageFlags.Ephemeral,
            allowedMentions: expect.any(Object)
        });
        expect(deleteProxiedMessage).not.toHaveBeenCalled();
    });

    it('deletes proxied message when validation passes', async () => {
        vi.mocked(proxiedMessageRepo.getByWebhookMessageId).mockResolvedValue(record as any);
        vi.mocked(getChannelProxy).mockReturnValue({} as any);
        vi.mocked(deleteProxiedMessage).mockResolvedValue();

        await deleteProxiedContextCommand.execute(interaction);

        expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
        expect(deleteProxiedMessage).toHaveBeenCalledWith(
            {
                record,
                userId: 'user-123'
            },
            expect.anything()
        );
        expect(interaction.deleteReply).toHaveBeenCalled();
    });

    it('handles execution errors via interaction error handler', async () => {
        vi.mocked(proxiedMessageRepo.getByWebhookMessageId).mockResolvedValue(record as any);
        vi.mocked(getChannelProxy).mockReturnValue({} as any);
        vi.mocked(deleteProxiedMessage).mockRejectedValue(new Error('failure'));

        await deleteProxiedContextCommand.execute(interaction);

        expect(handleInteractionError).toHaveBeenCalledWith(
            interaction,
            expect.any(Error),
            expect.objectContaining({
                component: 'proxy-context',
                userId: 'user-123',
                interactionId: 'interaction-1'
            }),
            expect.stringContaining('failure'),
            expect.objectContaining({ preferFollowUp: true })
        );
    });
});
