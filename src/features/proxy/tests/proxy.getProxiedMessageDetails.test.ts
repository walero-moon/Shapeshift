import { describe, it, expect, vi } from 'vitest';
import { getProxiedMessageDetails } from '../app/GetProxiedMessageDetails';

describe('getProxiedMessageDetails', () => {
    const baseRecord = {
        id: 'record-1',
        userId: 'user-1',
        formId: 'form-1',
        guildId: 'guild-1',
        channelId: 'channel-1',
        webhookId: 'webhook-1',
        webhookToken: 'token-1',
        messageId: 'message-1',
        sourceMessageId: 'source-1',
        createdAt: new Date()
    };

    it('returns details with form info', async () => {
        const mockRepo = {
            getByWebhookMessageId: vi.fn().mockResolvedValue(baseRecord)
        } as any;
        const mockForms = {
            getById: vi.fn().mockResolvedValue({
                id: 'form-1',
                name: 'Test Form',
                avatarUrl: 'https://example.com/avatar.png'
            })
        } as any;

        const result = await getProxiedMessageDetails('message-1', mockRepo, mockForms);

        expect(mockRepo.getByWebhookMessageId).toHaveBeenCalledWith('message-1');
        expect(mockForms.getById).toHaveBeenCalledWith('form-1');
        expect(result.formName).toBe('Test Form');
        expect(result.formAvatarUrl).toBe('https://example.com/avatar.png');
    });

    it('throws when record missing', async () => {
        const mockRepo = {
            getByWebhookMessageId: vi.fn().mockResolvedValue(null)
        } as any;

        await expect(getProxiedMessageDetails('missing', mockRepo)).rejects.toThrow('This message is not tracked as a proxied message.');
    });

    it('falls back to placeholder when form missing', async () => {
        const mockRepo = {
            getByWebhookMessageId: vi.fn().mockResolvedValue(baseRecord)
        } as any;
        const mockForms = {
            getById: vi.fn().mockResolvedValue(null)
        } as any;

        const result = await getProxiedMessageDetails('message-1', mockRepo, mockForms);

        expect(result.formName).toBe('Unknown form');
        expect(result.formAvatarUrl).toBeNull();
    });
});
