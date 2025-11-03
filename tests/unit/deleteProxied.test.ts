import { describe, it, expect, vi, beforeEach } from 'vitest';
import { context } from '../../src/discord/contexts/deleteProxied';
import { DeleteService } from '../../src/discord/services/DeleteService';
import { WebhookRegistry } from '../../src/discord/services/WebhookRegistry';

// Mock DeleteService
vi.mock('../../src/discord/services/DeleteService', () => ({
    DeleteService: class {
        deleteProxied = vi.fn();
    },
}));

// Mock WebhookRegistry
vi.mock('../../src/discord/services/WebhookRegistry', () => ({
    WebhookRegistry: class {
        getOrCreate = vi.fn();
    },
}));

describe('deleteProxied context menu', () => {
    let mockInteraction: any;
    let mockDeleteService: any;
    let mockWebhookRegistry: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockInteraction = {
            targetMessage: { id: 'msg123' },
            channel: { id: 'channel123' },
            user: { id: 'user123' },
            reply: vi.fn(),
        };
        mockDeleteService = new (require('../../src/discord/services/DeleteService').DeleteService)();
        mockWebhookRegistry = new (require('../../src/discord/services/WebhookRegistry').WebhookRegistry)();
    });

    it('should appear on proxied messages', () => {
        expect(context.data.name).toBe('Delete proxied message');
        expect(context.data.type).toBe(2); // ApplicationCommandType.Message
        expect(context.data.dmPermission).toBe(false);
    });

    it('should delete successfully with webhook token', async () => {
        const mockWebhook = { token: 'token123' };
        mockWebhookRegistry.getOrCreate.mockResolvedValue(mockWebhook);
        mockDeleteService.deleteProxied.mockResolvedValue({ ok: true });

        await context.execute(mockInteraction);

        expect(mockWebhookRegistry.getOrCreate).toHaveBeenCalledWith(mockInteraction.channel);
        expect(mockDeleteService.deleteProxied).toHaveBeenCalledWith({
            channel: mockInteraction.channel,
            messageId: 'msg123',
            webhookToken: 'token123',
            actorUserId: 'user123',
        });
        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: 'Proxied message deleted successfully.',
            ephemeral: true,
        });
    });

    it('should delete successfully without webhook token', async () => {
        mockWebhookRegistry.getOrCreate.mockRejectedValue(new Error('No webhook'));
        mockDeleteService.deleteProxied.mockResolvedValue({ ok: true });

        await context.execute(mockInteraction);

        expect(mockDeleteService.deleteProxied).toHaveBeenCalledWith({
            channel: mockInteraction.channel,
            messageId: 'msg123',
            webhookToken: undefined,
            actorUserId: 'user123',
        });
        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: 'Proxied message deleted successfully.',
            ephemeral: true,
        });
    });

    it('should handle deletion failure', async () => {
        mockWebhookRegistry.getOrCreate.mockResolvedValue({ token: 'token123' });
        mockDeleteService.deleteProxied.mockResolvedValue({ ok: false, reason: 'Unauthorized' });

        await context.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: 'Failed to delete proxied message: Unauthorized',
            ephemeral: true,
        });
    });

    it('should handle errors gracefully', async () => {
        mockWebhookRegistry.getOrCreate.mockRejectedValue(new Error('Webhook error'));

        await context.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith({
            content: 'An error occurred: Webhook error',
            ephemeral: true,
        });
    });
});