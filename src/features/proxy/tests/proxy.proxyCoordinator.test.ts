import { describe, it, expect, beforeEach, vi, Mocked } from 'vitest';
import { proxyCoordinator } from '../app/ProxyCoordinator';
import { ChannelProxyPort, ProxyAttachment } from '../../../shared/ports/ChannelProxyPort';
import { formRepo } from '../../identity/infra/FormRepo';
import { proxiedMessageRepo } from '../infra/ProxiedMessageRepo';
import { generateUuidv7OrUndefined } from '../../../shared/db/uuidDetection';
import { log } from '../../../shared/utils/logger';
import { Form } from '../../identity/infra/FormRepo';

// Mock dependencies
vi.mock('../../../shared/utils/logger', () => ({
    log: {
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn().mockReturnThis(),
    },
}));

vi.mock('../../identity/infra/FormRepo', () => ({
    formRepo: {
        getById: vi.fn(),
    },
}));

vi.mock('../infra/ProxiedMessageRepo', () => ({
    proxiedMessageRepo: {
        insert: vi.fn(),
    },
}));

vi.mock('../../../shared/db/uuidDetection', () => ({
    generateUuidv7OrUndefined: vi.fn(),
}));

describe('proxyCoordinator function', () => {
    let mockChannelProxy: Mocked<ChannelProxyPort>;
    let mockForm: Form;

    beforeEach(() => {
        vi.clearAllMocks();

        mockChannelProxy = {
            send: vi.fn(),
            edit: vi.fn(),
            delete: vi.fn(),
        };

        mockForm = {
            id: 'form1',
            userId: 'user1',
            name: 'TestForm',
            avatarUrl: 'https://example.com/avatar.png',
            createdAt: new Date(),
        };

        (formRepo.getById as any).mockResolvedValue(mockForm);
        (generateUuidv7OrUndefined as any).mockReturnValue('uuid123');
        (proxiedMessageRepo.insert as any).mockResolvedValue(undefined);
    });

    it('should successfully coordinate proxy operation', async () => {
        const mockSendResult = {
            webhookId: 'webhook123',
            webhookToken: 'token456',
            messageId: 'msg789',
        };
        mockChannelProxy.send.mockResolvedValue(mockSendResult);

        const result = await proxyCoordinator(
            'user1',
            'form1',
            'channel1',
            'guild1',
            'Hello world!',
            mockChannelProxy
        );

        expect(result).toEqual({
            webhookId: 'webhook123',
            token: 'token456',
            messageId: 'msg789',
        });

        expect(formRepo.getById).toHaveBeenCalledWith('form1');
        expect(mockChannelProxy.send).toHaveBeenCalledWith({
            username: 'TestForm',
            content: 'Hello world!',
            allowedMentions: { parse: [], repliedUser: false },
            avatarUrl: 'https://example.com/avatar.png',
        }, undefined);
        expect(proxiedMessageRepo.insert).toHaveBeenCalledWith({
            id: 'uuid123',
            userId: 'user1',
            formId: 'form1',
            guildId: 'guild1',
            channelId: 'channel1',
            webhookId: 'webhook123',
            webhookToken: 'token456',
            messageId: 'msg789',
        });
        expect(log.info).toHaveBeenCalledTimes(2); // start and success
        expect(log.error).not.toHaveBeenCalled();
    });

    it('should handle form with null avatar', async () => {
        mockForm.avatarUrl = null;
        const mockSendResult = {
            webhookId: 'webhook123',
            webhookToken: 'token456',
            messageId: 'msg789',
        };
        mockChannelProxy.send.mockResolvedValue(mockSendResult);

        await proxyCoordinator(
            'user1',
            'form1',
            'channel1',
            'guild1',
            'Hello world!',
            mockChannelProxy
        );

        expect(mockChannelProxy.send).toHaveBeenCalledWith({
            username: 'TestForm',
            content: 'Hello world!',
            allowedMentions: { parse: [], repliedUser: false },
        }, undefined);
        expect(mockChannelProxy.send).not.toHaveBeenCalledWith(
            expect.objectContaining({ avatarUrl: expect.anything() })
        );
    });

    it('should handle attachments', async () => {
        const attachments = [
            { name: 'file1.png', data: Buffer.from('test attachment') },
        ] as ProxyAttachment[];
        const mockSendResult = {
            webhookId: 'webhook123',
            webhookToken: 'token456',
            messageId: 'msg789',
        };
        mockChannelProxy.send.mockResolvedValue(mockSendResult);

        await proxyCoordinator(
            'user1',
            'form1',
            'channel1',
            'guild1',
            'Hello with attachment!',
            mockChannelProxy,
            attachments
        );

        expect(mockChannelProxy.send).toHaveBeenCalledWith({
            username: 'TestForm',
            content: 'Hello with attachment!',
            allowedMentions: { parse: [], repliedUser: false },
            avatarUrl: 'https://example.com/avatar.png',
            attachments,
        }, undefined);
    });

    it('should throw error when form not found', async () => {
        (formRepo.getById as any).mockResolvedValue(null);

        await expect(proxyCoordinator(
            'user1',
            'form1',
            'channel1',
            'guild1',
            'Hello world!',
            mockChannelProxy
        )).rejects.toThrow('Form with ID form1 not found');

        expect(mockChannelProxy.send).not.toHaveBeenCalled();
        expect(proxiedMessageRepo.insert).not.toHaveBeenCalled();
        expect(log.error).toHaveBeenCalled();
    });

    it('should throw error when channel proxy send fails', async () => {
        mockChannelProxy.send.mockRejectedValue(new Error('Webhook failed'));

        await expect(proxyCoordinator(
            'user1',
            'form1',
            'channel1',
            'guild1',
            'Hello world!',
            mockChannelProxy
        )).rejects.toThrow('Webhook failed');

        expect(proxiedMessageRepo.insert).not.toHaveBeenCalled();
        expect(log.error).toHaveBeenCalled();
    });

    it('should handle UUID generation failure', async () => {
        (generateUuidv7OrUndefined as any).mockReturnValue(undefined);
        const mockSendResult = {
            webhookId: 'webhook123',
            webhookToken: 'token456',
            messageId: 'msg789',
        };
        mockChannelProxy.send.mockResolvedValue(mockSendResult);

        await proxyCoordinator(
            'user1',
            'form1',
            'channel1',
            'guild1',
            'Hello world!',
            mockChannelProxy
        );

        expect(proxiedMessageRepo.insert).toHaveBeenCalledWith({
            userId: 'user1',
            formId: 'form1',
            guildId: 'guild1',
            channelId: 'channel1',
            webhookId: 'webhook123',
            webhookToken: 'token456',
            messageId: 'msg789',
        });
    });

    it('should throw error when database insert fails', async () => {
        const mockSendResult = {
            webhookId: 'webhook123',
            webhookToken: 'token456',
            messageId: 'msg789',
        };
        mockChannelProxy.send.mockResolvedValue(mockSendResult);
        (proxiedMessageRepo.insert as any).mockRejectedValue(new Error('DB insert failed'));

        await expect(proxyCoordinator(
            'user1',
            'form1',
            'channel1',
            'guild1',
            'Hello world!',
            mockChannelProxy
        )).rejects.toThrow('DB insert failed');

        expect(log.error).toHaveBeenCalled();
    });

    it('should log start and error on failure', async () => {
        mockChannelProxy.send.mockRejectedValue(new Error('Send failed'));

        await expect(proxyCoordinator(
            'user1',
            'form1',
            'channel1',
            'guild1',
            'Hello world!',
            mockChannelProxy
        )).rejects.toThrow();

        expect(log.info).toHaveBeenCalledWith('Starting proxy coordination', expect.objectContaining({
            component: 'proxy',
            userId: 'user1',
            formId: 'form1',
            guildId: 'guild1',
            channelId: 'channel1',
            status: 'proxy_start'
        }));
        expect(log.error).toHaveBeenCalledWith('Proxy coordination failed', expect.objectContaining({
            component: 'proxy',
            userId: 'user1',
            formId: 'form1',
            guildId: 'guild1',
            channelId: 'channel1',
            status: 'proxy_error',
            error: expect.any(Error)
        }));
    });

    it('should use pre-fetched form and skip database query', async () => {
        const mockSendResult = {
            webhookId: 'webhook123',
            webhookToken: 'token456',
            messageId: 'msg789',
        };
        mockChannelProxy.send.mockResolvedValue(mockSendResult);

        const result = await proxyCoordinator(
            'user1',
            'form1',
            'channel1',
            'guild1',
            'Hello world!',
            mockChannelProxy,
            undefined, // attachments
            undefined, // replyTo
            mockForm // pre-fetched form
        );

        expect(result).toEqual({
            webhookId: 'webhook123',
            token: 'token456',
            messageId: 'msg789',
        });

        // Should not call formRepo.getById when form is provided
        expect(formRepo.getById).not.toHaveBeenCalled();

        // Should log that form was pre-fetched
        expect(log.debug).toHaveBeenCalledWith('Form resolved for proxy coordination', expect.objectContaining({
            component: 'proxy',
            userId: 'user1',
            formId: 'form1',
            guildId: 'guild1',
            channelId: 'channel1',
            formPrefetched: true,
            status: 'form_resolved'
        }));

        // Should use the provided form for building payload
        expect(mockChannelProxy.send).toHaveBeenCalledWith({
            username: 'TestForm',
            content: 'Hello world!',
            allowedMentions: { parse: [], repliedUser: false },
            avatarUrl: 'https://example.com/avatar.png',
        }, undefined);
    });

    it('should handle pre-fetched form with null avatar', async () => {
        const formWithNullAvatar = { ...mockForm, avatarUrl: null };
        const mockSendResult = {
            webhookId: 'webhook123',
            webhookToken: 'token456',
            messageId: 'msg789',
        };
        mockChannelProxy.send.mockResolvedValue(mockSendResult);

        await proxyCoordinator(
            'user1',
            'form1',
            'channel1',
            'guild1',
            'Hello world!',
            mockChannelProxy,
            undefined, // attachments
            undefined, // replyTo
            formWithNullAvatar // pre-fetched form
        );

        expect(formRepo.getById).not.toHaveBeenCalled();
        expect(mockChannelProxy.send).toHaveBeenCalledWith({
            username: 'TestForm',
            content: 'Hello world!',
            allowedMentions: { parse: [], repliedUser: false },
        }, undefined);
        expect(mockChannelProxy.send).not.toHaveBeenCalledWith(
            expect.objectContaining({ avatarUrl: expect.anything() })
        );
    });

    it('should log formPrefetched false when form is not provided', async () => {
        const mockSendResult = {
            webhookId: 'webhook123',
            webhookToken: 'token456',
            messageId: 'msg789',
        };
        mockChannelProxy.send.mockResolvedValue(mockSendResult);

        await proxyCoordinator(
            'user1',
            'form1',
            'channel1',
            'guild1',
            'Hello world!',
            mockChannelProxy
        );

        expect(log.debug).toHaveBeenCalledWith('Form resolved for proxy coordination', expect.objectContaining({
            component: 'proxy',
            userId: 'user1',
            formId: 'form1',
            guildId: 'guild1',
            channelId: 'channel1',
            formPrefetched: false,
            status: 'form_resolved'
        }));
    });
});