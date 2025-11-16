import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reuploadAttachments } from '../attachments';
import { retryAsync } from '../retry';
import { log } from '../logger';
import { handleDegradedModeError } from '../errorHandling';

// Mock dependencies
vi.mock('../retry');
vi.mock('../logger');
vi.mock('../errorHandling');

const mockFromWeb = vi.fn();
vi.mock('node:stream', () => ({
    Readable: {
        fromWeb: mockFromWeb
    }
}));

describe('reuploadAttachments', () => {
    const mockRetryAsync = vi.mocked(retryAsync);
    const mockLog = vi.mocked(log);
    const mockHandleDegradedModeError = vi.mocked(handleDegradedModeError);

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset mocks to default behavior
        mockRetryAsync.mockImplementation(async (operation) => operation());
        mockHandleDegradedModeError.mockImplementation(async (operation) => operation());
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return empty array for no attachments', async () => {
        const result = await reuploadAttachments([]);
        expect(result).toEqual([]);

        expect(mockLog.debug).toHaveBeenCalledWith(
            'No attachments to reupload',
            expect.objectContaining({
                component: 'utils',
                stage: 'attachments',
                durationMs: 0,
                status: 'attachment_noop'
            })
        );
    });

    it('should successfully download attachment using buffer', async () => {
        const mockResponse = {
            ok: true,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
        };

        mockRetryAsync.mockResolvedValue(mockResponse as any);

        const attachments = [{
            name: 'test.png',
            url: 'https://example.com/test.png',
            id: '123'
        }];

        const result = await reuploadAttachments(attachments);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            name: 'test.png',
            data: Buffer.from(new ArrayBuffer(8))
        });

        expect(mockLog.debug).toHaveBeenCalledWith(
            'Using buffer download for attachment (streaming disabled for webhook compatibility)',
            expect.objectContaining({
                component: 'utils',
                attachmentId: '123',
                status: 'attachment_buffer_download'
            })
        );
    });


    it('should handle fetch failures with retry and skip failed attachments', async () => {
        mockRetryAsync.mockRejectedValue(new Error('Network error'));

        const attachments = [{
            name: 'test.png',
            url: 'https://example.com/test.png',
            id: '123'
        }];

        const result = await reuploadAttachments(attachments);

        expect(result).toEqual([]);
        expect(mockLog.warn).toHaveBeenCalledWith(
            'Failed to reupload attachment for webhook',
            expect.objectContaining({
                component: 'utils',
                attachmentId: '123',
                status: 'attachment_reupload_failed'
            })
        );
    });

    it('should handle HTTP error responses', async () => {
        const mockResponse = {
            ok: false,
            status: 404,
            statusText: 'Not Found'
        };

        mockRetryAsync.mockResolvedValue(mockResponse as any);

        const attachments = [{
            name: 'test.png',
            url: 'https://example.com/test.png',
            id: '123'
        }];

        const result = await reuploadAttachments(attachments);

        expect(result).toEqual([]);
        expect(mockLog.warn).toHaveBeenCalledWith(
            'Failed to reupload attachment for webhook',
            expect.objectContaining({
                component: 'utils',
                attachmentId: '123',
                status: 'attachment_reupload_failed'
            })
        );
    });

    it('should use default name when attachment name is not provided', async () => {
        const mockResponse = {
            ok: true,
            body: null,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
        };

        mockRetryAsync.mockResolvedValue(mockResponse as any);

        const attachments = [{
            name: '',
            url: 'https://example.com/test.png',
            id: '123'
        }];

        const result = await reuploadAttachments(attachments);

        expect(result).toHaveLength(1);
        expect(result[0]!.name).toBe('attachment_123');
    });

    it('should handle multiple attachments with mixed success/failure', async () => {
        const mockSuccessResponse = {
            ok: true,
            body: null,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
        };

        mockRetryAsync
            .mockResolvedValueOnce(mockSuccessResponse as any)
            .mockRejectedValueOnce(new Error('Network error'));

        const attachments = [
            {
                name: 'success.png',
                url: 'https://example.com/success.png',
                id: '123'
            },
            {
                name: 'fail.png',
                url: 'https://example.com/fail.png',
                id: '456'
            }
        ];

        const result = await reuploadAttachments(attachments);

        expect(result).toHaveLength(1);
        expect(result).toHaveLength(1);
        expect(result[0]!.name).toBe('success.png');
    });


    it('should log duration for failed downloads', async () => {
        mockRetryAsync.mockRejectedValue(new Error('Network error'));

        const attachments = [{
            name: 'test.png',
            url: 'https://example.com/test.png',
            id: '123'
        }];

        await reuploadAttachments(attachments);

        expect(mockLog.warn).toHaveBeenCalledWith(
            'Failed to reupload attachment for webhook',
            expect.objectContaining({
                component: 'utils',
                attachmentId: '123',
                durationMs: expect.any(Number),
                status: 'attachment_reupload_failed'
            })
        );
    });
});